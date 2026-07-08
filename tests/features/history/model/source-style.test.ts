import { describe, it, expect } from "vitest";
import { Activity, Table2, Upload, WandSparkles } from "lucide-react";

import { sourceStyle } from "@/features/history/model/source-style";
import type { SourceStyle } from "@/features/history/model/source-style";
import type { HistorySource } from "@/features/history/model/types";

// ── sourceStyle ────────────────────────────────────────────────────────────────

describe("sourceStyle", () => {
  // ── dataset ──────────────────────────────────────────────────────────────────
  describe('when source is "dataset"', () => {
    it("returns the Upload icon", () => {
      // Arrange
      const source: HistorySource = "dataset";
      // Act
      const style: SourceStyle = sourceStyle(source);
      // Assert
      expect(style.icon).toBe(Upload);
    });

    it("returns the emerald dot class", () => {
      const style = sourceStyle("dataset");
      expect(style.dot).toBe("bg-emerald-500");
    });

    it("returns the emerald badge class", () => {
      const style = sourceStyle("dataset");
      expect(style.badge).toBe(
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      );
    });
  });

  // ── transform ────────────────────────────────────────────────────────────────
  describe('when source is "transform"', () => {
    it("returns the WandSparkles icon", () => {
      const style = sourceStyle("transform");
      expect(style.icon).toBe(WandSparkles);
    });

    it("returns the indigo dot class", () => {
      const style = sourceStyle("transform");
      expect(style.dot).toBe("bg-indigo-500");
    });

    it("returns the indigo badge class", () => {
      const style = sourceStyle("transform");
      expect(style.badge).toBe(
        "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
      );
    });
  });

  // ── query ────────────────────────────────────────────────────────────────────
  describe('when source is "query"', () => {
    it("returns the Table2 icon", () => {
      const style = sourceStyle("query");
      expect(style.icon).toBe(Table2);
    });

    it("returns the cyan dot class", () => {
      const style = sourceStyle("query");
      expect(style.dot).toBe("bg-cyan-500");
    });

    it("returns the cyan badge class", () => {
      const style = sourceStyle("query");
      expect(style.badge).toBe(
        "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      );
    });
  });

  // ── activity ─────────────────────────────────────────────────────────────────
  describe('when source is "activity"', () => {
    it("returns the Activity icon", () => {
      const style = sourceStyle("activity");
      expect(style.icon).toBe(Activity);
    });

    it("returns the amber dot class", () => {
      const style = sourceStyle("activity");
      expect(style.dot).toBe("bg-amber-500");
    });

    it("returns the amber badge class", () => {
      const style = sourceStyle("activity");
      expect(style.badge).toBe(
        "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      );
    });
  });

  // ── nullish coalescing fallback ───────────────────────────────────────────────
  describe("?? fallback branch", () => {
    it("falls back to the activity style for an unknown source value", () => {
      // Cast to HistorySource to exercise the ?? STYLES.activity branch
      const style = sourceStyle("unknown" as HistorySource);
      expect(style.icon).toBe(Activity);
      expect(style.dot).toBe("bg-amber-500");
      expect(style.badge).toBe(
        "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      );
    });

    it("falls back to activity style when source is an empty string", () => {
      const style = sourceStyle("" as HistorySource);
      expect(style.icon).toBe(Activity);
    });
  });

  // ── return shape ─────────────────────────────────────────────────────────────
  describe("return value shape", () => {
    it("always returns an object with icon, dot, and badge properties", () => {
      const sources: HistorySource[] = [
        "dataset",
        "transform",
        "query",
        "activity",
      ];
      for (const source of sources) {
        const style = sourceStyle(source);
        expect(style).toHaveProperty("icon");
        expect(style).toHaveProperty("dot");
        expect(style).toHaveProperty("badge");
        expect(typeof style.dot).toBe("string");
        expect(typeof style.badge).toBe("string");
      }
    });

    it("icon is a React component (function or object)", () => {
      const sources: HistorySource[] = [
        "dataset",
        "transform",
        "query",
        "activity",
      ];
      for (const source of sources) {
        const { icon } = sourceStyle(source);
        // lucide-react components may be functions or forwardRef objects
        const isComponent =
          typeof icon === "function" ||
          (typeof icon === "object" && icon !== null);
        expect(isComponent).toBe(true);
      }
    });
  });
});
