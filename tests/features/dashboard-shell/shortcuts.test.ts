import { describe, expect, it } from "vitest";
import { APP_SHORTCUTS, formatKey } from "@/features/dashboard-shell/shell/shortcuts";

describe("APP_SHORTCUTS", () => {
  it("is a non-empty list with unique ids and complete entries", () => {
    expect(APP_SHORTCUTS.length).toBeGreaterThan(0);
    const ids = APP_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shortcut of APP_SHORTCUTS) {
      expect(shortcut.combo.length).toBeGreaterThan(0);
      expect(shortcut.label.trim()).not.toBe("");
    }
  });

  it("documents the real, wired shell shortcuts", () => {
    const ids = APP_SHORTCUTS.map((s) => s.id);
    expect(ids).toContain("command-palette");
    expect(ids).toContain("toggle-ai");
    expect(ids).toContain("toggle-sidebar");
    expect(ids).toContain("show-shortcuts");
  });
});

describe("formatKey", () => {
  it("renders the mod token per platform", () => {
    expect(formatKey("mod", false)).toBe("Ctrl");
    expect(formatKey("mod", true)).toBe("⌘");
  });

  it("renders the shift token per platform", () => {
    expect(formatKey("shift", false)).toBe("Shift");
    expect(formatKey("shift", true)).toBe("⇧");
  });

  it("passes through literal keys unchanged", () => {
    expect(formatKey("K", false)).toBe("K");
    expect(formatKey("?", true)).toBe("?");
  });
});
