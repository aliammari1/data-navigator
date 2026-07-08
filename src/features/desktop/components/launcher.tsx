"use client";

import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LAUNCHER_APPS } from "@/features/desktop/core/app-registry";
import { useDesktopActions, useLauncherOpen } from "@/features/desktop/store/desktop-store";

/**
 * macOS Launchpad — a full-screen frosted-glass grid of every app with a search
 * field. Click an app to open it (single-instance apps focus). Escape / click
 * the backdrop to close. Glass + accent are palette-driven (`--glass-*`).
 */
export function Launcher() {
  const open = useLauncherOpen();
  const { setLauncherOpen, openApp } = useDesktopActions();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return LAUNCHER_APPS;
    return LAUNCHER_APPS.filter(
      (a) =>
        a.title.toLowerCase().includes(term) ||
        a.blurb.toLowerCase().includes(term) ||
        a.id.includes(term),
    );
  }, [q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[var(--z-palette)] flex flex-col items-center px-6 pt-[12vh]"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(40px) saturate(1.5)",
            WebkitBackdropFilter: "blur(40px) saturate(1.5)",
          }}
          onClick={() => setLauncherOpen(false)}
        >
          <motion.div
            initial={{ y: 18, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="flex w-full max-w-4xl flex-col items-center gap-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search */}
            <div className="relative w-full max-w-md">
              <Search
                className="absolute left-4 top-1/2 size-4 -translate-y-1/2"
                style={{ color: "var(--glass-text-dim)" }}
              />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setLauncherOpen(false);
                  if (e.key === "Enter" && results[0]) openApp(results[0].id);
                }}
                placeholder="Rechercher"
                className="w-full rounded-full border py-2.5 pl-11 pr-4 text-center text-sm outline-none"
                style={{
                  background: "var(--glass-bg-strong)",
                  borderColor: "var(--glass-border)",
                  color: "var(--glass-text)",
                  backdropFilter: "blur(12px)",
                }}
              />
            </div>

            {/* App grid */}
            <div className="grid max-h-[62vh] grid-cols-4 gap-x-6 gap-y-7 overflow-auto px-2 pb-8 sm:grid-cols-6 lg:grid-cols-7">
              {results.map((app, i) => {
                const Icon = app.icon;
                return (
                  <motion.button
                    key={app.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.012, 0.25) }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => openApp(app.id)}
                    className="flex w-24 flex-col items-center gap-2"
                  >
                    <span
                      className="grid size-16 place-items-center rounded-[22px] border shadow-lg"
                      style={{
                        background: `linear-gradient(155deg, hsl(${app.hue} 78% 72%), hsl(${app.hue} 60% 54%))`,
                        borderColor: "rgba(255,255,255,0.35)",
                      }}
                    >
                      <Icon className="size-8 text-white drop-shadow" />
                    </span>
                    <span
                      className="line-clamp-2 text-center text-xs font-medium leading-tight drop-shadow"
                      style={{ color: "var(--glass-text)" }}
                    >
                      {app.title}
                    </span>
                  </motion.button>
                );
              })}
              {results.length === 0 && (
                <p
                  className="col-span-full py-12 text-center text-sm"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  Aucune application ne correspond à « {q} ».
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
