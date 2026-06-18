"use client";

import { motion } from "motion/react";

/** Three animated bars indicating active narration. */
export function SpeakingAnimation() {
  return (
    <div className="flex h-5 items-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary"
          animate={{ height: ["4px", "20px", "4px"] }}
          transition={{
            duration: 0.7,
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
