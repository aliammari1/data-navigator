"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getAppSettingRemote, putAppSettingRemote } from "@/platform/settings/settings-client";
import { STORAGE_KEYS } from "@/platform/storage/storage-keys";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeProviderProps {
  children: ReactNode;
  attribute?: "class" | `data-${string}`;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => undefined,
  resolvedTheme: "dark",
  systemTheme: "dark",
  themes: ["light", "dark", "system"],
});

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(
  theme: ResolvedTheme,
  attribute: ThemeProviderProps["attribute"],
  disableTransitionOnChange: boolean,
) {
  const root = document.documentElement;
  let transitionStyle: HTMLStyleElement | null = null;

  if (disableTransitionOnChange) {
    transitionStyle = document.createElement("style");
    transitionStyle.appendChild(
      document.createTextNode("*,*::before,*::after{transition:none!important}"),
    );
    document.head.appendChild(transitionStyle);
  }

  if (attribute === "class") {
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  } else if (attribute) {
    root.setAttribute(attribute, theme);
  }

  root.style.colorScheme = theme;

  if (transitionStyle) {
    window.getComputedStyle(document.body);
    window.setTimeout(() => transitionStyle?.remove(), 1);
  }
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "dark",
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    let cancelled = false;
    const isValid = (t: string | null): t is Theme =>
      t === "light" || t === "dark" || (enableSystem && t === "system");

    let storedTheme: Theme | null = null;
    try {
      storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as Theme | null;
    } catch {
      storedTheme = null;
    }

    if (isValid(storedTheme)) {
      setThemeState(storedTheme);
      return;
    }

    // Cold restore: no local working copy (fresh profile / cleared cache). Pull
    // the durable theme from drizzle settings and adopt it. Best-effort — keeps
    // the default theme if the durable read is unavailable.
    void getAppSettingRemote<Theme>("settings", "theme")
      .then(({ value }) => {
        if (cancelled || !isValid(value)) return;
        try {
          localStorage.setItem(STORAGE_KEYS.theme, value);
        } catch {
          // storage unavailable — React state still updates below
        }
        setThemeState(value);
      })
      .catch(() => {
        // durable read unavailable — keep the default theme
      });

    return () => {
      cancelled = true;
    };
  }, [enableSystem]);

  useEffect(() => {
    if (!enableSystem) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(getSystemTheme());

    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, [enableSystem]);

  const resolvedTheme = theme === "system" && enableSystem ? systemTheme : (theme as ResolvedTheme);

  useEffect(() => {
    applyTheme(resolvedTheme, attribute, disableTransitionOnChange);
  }, [attribute, disableTransitionOnChange, resolvedTheme]);

  const setTheme = useCallback<Dispatch<SetStateAction<Theme>>>((value) => {
    setThemeState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      try {
        localStorage.setItem(STORAGE_KEYS.theme, next);
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }
      // Best-effort durable mirror into drizzle settings. localStorage stays the
      // authoritative pre-paint read; this only adds durability + backup inclusion.
      void putAppSettingRemote("settings", "theme", next).catch(() => {});
      return next;
    });
  }, []);

  const context = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes: enableSystem ? ["light", "dark", "system"] : ["light", "dark"],
    }),
    [enableSystem, resolvedTheme, setTheme, systemTheme, theme],
  );

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
