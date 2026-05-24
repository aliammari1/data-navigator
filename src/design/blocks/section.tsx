"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AtlasCard } from "../primitives/card";

interface SectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  pad?: "none" | "sm" | "md" | "lg";
  initial?: boolean;
}

export function AtlasSection({
  title,
  description,
  icon,
  action,
  badge,
  children,
  contentClassName,
  pad = "md",
  initial = true,
}: SectionProps) {
  return (
    <motion.div
      initial={initial ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <AtlasCard variant="surface" pad="none">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-(--atlas-border)">
          <div className="flex items-start gap-2.5 min-w-0">
            {icon && (
              <div className="mt-0.5 text-(--atlas-accent-fg) [&>svg]:w-4 [&>svg]:h-4">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-(--atlas-text) text-sm font-semibold truncate">
                  {title}
                </h3>
                {badge}
              </div>
              {description && (
                <p className="text-(--atlas-text-subtle) text-xs mt-0.5 leading-snug">
                  {description}
                </p>
              )}
            </div>
          </div>
          {action && <div className="flex-none">{action}</div>}
        </div>
        <div
          className={`${pad === "none" ? "" : pad === "sm" ? "p-3" : pad === "lg" ? "p-5" : "p-4"} ${contentClassName ?? ""}`}
        >
          {children}
        </div>
      </AtlasCard>
    </motion.div>
  );
}
