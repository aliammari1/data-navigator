"use client";

import { HelpCircle, Keyboard, Search } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import { FaqItem } from "../components/FaqItem";
import { FeatureCard } from "../components/FeatureCard";
import { HelpFeedback } from "../components/HelpFeedback";
import { TourLauncher } from "../components/TourLauncher";
import { SHORTCUT_GROUPS } from "../data/help-content";
import { useHelpSearch } from "../lib/use-help-search";

type Section = "features" | "faq" | "shortcuts";

const SECTIONS: readonly Section[] = ["features", "faq", "shortcuts"] as const;

export default function HelpScreen() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("features");

  // Fuzzy search (fuse.js) with useDeferredValue + useMemo — built once at
  // module load; no per-keystroke O(n) lowercasing or list re-animation.
  const { features, faqs, query } = useHelpSearch(search);

  return (
    <div className=" flex-1 overflow-y-auto">
      <div className=" max-w-4xl space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Help & Documentation
              </h1>
              <p className="text-sm text-muted-foreground">
                DataNavigator — offline-first data analysis platform
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search features, FAQ…"
              type="search"
              aria-label="Search help"
              className="w-full h-10 pl-9 pr-4 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
        </motion.div>

        {/* Guided tours — the driver.js tour mount point (replaces the dead,
            never-mounted react-joyride OnboardingTour). Hidden while searching
            so the search results stay the focus. */}
        {!query && <TourLauncher />}

        {/* Section tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl" role="tablist">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={activeSection === s}
              onClick={() => setActiveSection(s)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                activeSection === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "faq" ? "FAQ" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Features section */}
        {activeSection === "features" && (
          <motion.div
            key="features"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            {features.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">
                No features match &ldquo;{query}&rdquo;
              </p>
            )}
            {features.map((f) => (
              <FeatureCard key={f.id} f={f} />
            ))}
          </motion.div>
        )}

        {/* FAQ section */}
        {activeSection === "faq" && (
          <motion.div
            key="faq"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            {faqs.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">
                No FAQ matches &ldquo;{query}&rdquo;
              </p>
            )}
            {faqs.map((f) => (
              <FaqItem key={f.id} q={f.q} a={f.a} />
            ))}
          </motion.div>
        )}

        {/* Shortcuts section */}
        {activeSection === "shortcuts" && (
          <motion.div
            key="shortcuts"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {SHORTCUT_GROUPS.map((group) => {
              const GroupIcon = group.id === "global" ? Keyboard : group.icon;
              return (
                <div
                  key={group.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <GroupIcon className={cn("w-4 h-4", group.iconClassName)} />
                    <span className="text-sm font-semibold text-foreground">
                      {group.label}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {group.shortcuts.map(({ keys, desc }) => (
                      <div
                        key={desc}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">
                          {desc}
                        </span>
                        <div className="flex items-center gap-1">
                          {keys.map((k, i) => (
                            <span key={k}>
                              <kbd className="inline-flex items-center px-2 py-0.5 bg-muted border border-border rounded text-xs font-mono text-foreground">
                                {k}
                              </kbd>
                              {i < keys.length - 1 && (
                                <span className="text-muted-foreground text-xs mx-0.5">
                                  +
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Local feedback (replaces the previous external GitHub link) */}
        <HelpFeedback />
      </div>
    </div>
  );
}
