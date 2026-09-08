// FACTS (GateGuard): pure helpers + tiny hooks for the moudir-chat surface.
//   No store access, no side effects beyond localStorage/matchMedia. Imported by
//   moudir-chat-screen.tsx and the moudir-chat components. Keep this file free of
//   React component exports so the screen stays assembly-only.
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Humanize a GGUF file name ("gemma-3-4b-it-q4_k_m.gguf" → "gemma 3 4b it").
 * Strips directories first: older chat.db rows store the absolute model path,
 * which must never reach the badge (it leaks the OS username).
 */
export function basenameModel(model: string): string {
    return model.split(/[\\/]/).pop() ?? model;
}

export function humanizeModel(model: string): string {
    return basenameModel(model)
        .replace(/\.gguf$/i, "")
        .replace(/-q\d.*$/i, "")
        .replace(/[-_]/g, " ")
        .trim();
}

/** Platform-correct modifier glyph — this is a cross-platform Electron app. */
export const IS_MAC =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

export const MOD_GLYPH = IS_MAC ? "⌘" : "Ctrl";

const EDITABLE_SELECTOR =
    "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']";

/** True when a keystroke landed inside a text field — shortcuts must stand down. */
export function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return el?.matches?.(EDITABLE_SELECTOR) ?? false;
}

/** SSR-safe media query. Returns false during prerender, then settles. */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mql = window.matchMedia(query);
        setMatches(mql.matches);
        const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);

    return matches;
}

/**
 * Persisted scalar state. Replaces the panel-layout machinery for the sidebar:
 * one boolean instead of a percentage that drifts when the window resizes.
 *
 * NOTE: pass the type argument explicitly at the call site
 * (`usePersistentState<boolean>(key, true)`), otherwise `T` infers the *literal*
 * type of `initial` and the setter only accepts that one value.
 */
export function usePersistentState<T extends string | number | boolean>(
    key: string,
    initial: T,
): [T, (next: T) => void] {
    const [value, setValue] = useState<T>(initial);

    // Read after mount so prerender never touches localStorage.
    useEffect(() => {
        if (typeof window === "undefined" || !window.localStorage) return;
        const raw = window.localStorage.getItem(key);
        if (raw === null) return;
        try {
            setValue(JSON.parse(raw) as T);
        } catch {
            /* corrupt entry — keep the default */
        }
    }, [key]);

    const update = useCallback(
        (next: T) => {
            setValue(next);
            try {
                window.localStorage?.setItem(key, JSON.stringify(next));
            } catch {
                /* private mode / quota — in-memory only */
            }
        },
        [key],
    );

    return [value, update];
}