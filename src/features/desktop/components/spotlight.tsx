"use client";

import { ArrowRight, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandResultCard } from "@/features/desktop/components/command-result-card";
import { PINNED_APPS } from "@/features/desktop/core/app-registry";
import { resolveCommands } from "@/features/desktop/core/commands";
import { useDesktopActions, useSpotlightOpen } from "@/features/desktop/store/desktop-store";

/**
 * Spotlight — the centered command bar. It is the hero of the empty desktop and
 * also opens as an overlay from the taskbar search / ⊞ key. Type to fuzzy-match
 * an app (Enter opens it) or ask a data question (routed to the Moudir agent).
 */
export function Spotlight({ inline = false, greeting }: { inline?: boolean; greeting?: string }) {
  const spotlightOpen = useSpotlightOpen();
  const { openApp, setSpotlightOpen } = useDesktopActions();
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = inline || spotlightOpen;

  useEffect(() => {
    if (spotlightOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [spotlightOpen]);

  // Resolve the query into a ranked, runnable command list (apps, recent
  // datasets, appearance, calculator, export, and an always-present Moudir
  // fallback). Only shown once the user has typed something.
  const term = q.trim();
  const commands = useMemo(() => (term ? resolveCommands(term) : []), [term]);

  // Keep the keyboard selection in range as results change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: term is an intentional trigger to reset the selection when the query changes; it is not read in the effect body.
  useEffect(() => {
    setActiveIndex(0);
  }, [term]);

  const close = () => {
    setQ("");
    setActiveIndex(0);
    if (!inline) setSpotlightOpen(false);
  };

  // Run a command (default: the keyboard-active one), then dismiss.
  const runCommand = (cmd: (typeof commands)[number] | undefined) => {
    if (!cmd) return;
    cmd.run();
    close();
  };

  const submit = () => {
    if (!term) return;
    // Prefer the highlighted result; resolveCommands always returns at least the
    // Moudir fallback for a non-empty query, so this is defined when term exists.
    runCommand(commands[activeIndex] ?? commands[0]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (commands.length) setActiveIndex((i) => (i + 1) % commands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commands.length) setActiveIndex((i) => (i - 1 + commands.length) % commands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      close();
    }
  };

  const bar = (
    <div className="w-full max-w-xl">
      {inline && (
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground shadow-sm backdrop-blur-xl">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
            Data Navigator
          </span>
          <h1 className="text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-foreground [text-shadow:0_2px_28px_rgb(0_0_0_/_0.18)]">
            {greeting ?? "Bonjour"}
          </h1>
          <p className="mt-2.5 max-w-sm text-sm text-muted-foreground">
            Cherchez une application ou posez une question sur vos données.
          </p>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-foreground/40" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          // biome-ignore lint/a11y/noAutofocus: spotlight is the primary input surface of the empty desktop
          autoFocus={inline}
          placeholder="Demandez ou cherchez…  (ex. « top 5 canaux », « ouvrir le rapport »)"
          className="w-full rounded-2xl border border-[var(--win-border)] bg-[var(--win-acrylic)] py-3.5 pl-12 pr-12 text-[15px] text-foreground shadow-[0_18px_50px_-12px_rgba(0,0,0,0.4)] outline-none backdrop-blur-2xl ring-[hsl(var(--win-accent))]/40 placeholder:text-foreground/40 focus:ring-2"
        />
        {term && (
          <button
            type="button"
            onClick={submit}
            aria-label="Lancer"
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-xl bg-[hsl(var(--win-accent))] text-white transition hover:brightness-110"
          >
            <ArrowRight className="size-4" />
          </button>
        )}

        {/* Command results (KRunner-style) */}
        {term && commands.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--win-acrylic)] p-1.5 shadow-2xl backdrop-blur-2xl">
            {commands.map((cmd, i) => (
              <CommandResultCard
                key={cmd.id}
                result={cmd}
                active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => runCommand(cmd)}
              />
            ))}
          </div>
        )}
      </div>

      {inline && !q.trim() && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {PINNED_APPS.slice(0, 5).map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => openApp(a.id)}
                className="group flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/80"
              >
                <Icon className="size-3.5 text-primary" /> {a.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <div className="pointer-events-auto flex w-full justify-center">{bar}</div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[var(--z-palette)] flex items-start justify-center bg-black/20 px-6 pt-[18vh] backdrop-blur-sm"
          onPointerDown={() => setSpotlightOpen(false)}
        >
          <div onPointerDown={(e) => e.stopPropagation()}>{bar}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
