"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useScrollama } from "../hooks/use-scrollama";
import type { TheaterScene } from "../model/scene";
import { SCENE_COMPONENTS } from "../scenes/registry";

/**
 * Scrollytelling presenter: a sticky "stage" shows the active scene's chart
 * while scroll-spacer sections carrying narration drive which scene is active
 * via `scrollama` (IntersectionObserver). This is the actual "theater" UX the
 * feature name promised — no scroll-event jank, all offline.
 */
export function TheaterPresenter({ scenes }: { scenes: TheaterScene[] }) {
  const [active, setActive] = useState(0);
  const rootRef = useScrollama((index) => setActive(index));

  const current = scenes[Math.min(active, scenes.length - 1)];
  const Scene = current ? SCENE_COMPONENTS[current.kind] : null;

  return (
    <div ref={rootRef} className="relative">
      {/* Sticky stage: the active scene's live chart. */}
      <div className="sticky top-0 z-10 -mx-2 mb-4 bg-background/80 px-2 pt-2 pb-4 backdrop-blur">
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.id ?? "empty"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {current && (
              <h2 className="mb-2 text-lg font-semibold text-foreground">{current.title}</h2>
            )}
            {Scene ? <Scene /> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scroll spacers: each drives one step and carries the narration. */}
      <div className="space-y-2">
        {scenes.map((scene, i) => (
          <section key={scene.id} data-scene data-index={i} className="flex min-h-[60vh] items-end">
            <div
              className={`max-w-prose rounded-lg border p-5 text-base leading-relaxed transition-colors ${
                i === active
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border bg-card/40 text-muted-foreground"
              }`}
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scene {i + 1} · {scene.title}
              </p>
              {scene.narration}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
