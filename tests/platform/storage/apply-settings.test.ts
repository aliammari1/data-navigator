import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyAppearance,
  resolvePerformanceConfig,
  getRuntimePerformanceConfig,
  subscribePerformanceConfig,
  applySettings,
  type AppearanceInput,
  type PerformanceInput,
} from "@/platform/storage/apply-settings";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Read the value of a CSS custom property from <html>. */
function cssVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

/** Read a data-attribute from <html>. */
function dataAttr(name: string): string | null {
  return document.documentElement.getAttribute(name);
}

/** Clear all data-* attributes and inline styles set by the module. */
function cleanRoot(): void {
  const el = document.documentElement;
  for (const attr of ["data-accent", "data-density", "data-theme", "data-animations", "data-compact-numbers"]) {
    el.removeAttribute(attr);
  }
  el.style.removeProperty("--user-accent");
  el.style.removeProperty("--density-scale");
  el.style.removeProperty("--motion-allowed");
}

// ─── applyAppearance ──────────────────────────────────────────────────────────

describe("applyAppearance", () => {
  beforeEach(() => cleanRoot());
  afterEach(() => cleanRoot());

  // ── happy paths ──────────────────────────────────────────────────────────

  it("returns resolved values with valid accent color 'blue'", () => {
    // Arrange
    const input: AppearanceInput = { accentColor: "blue", density: "comfortable", theme: "light", animationsEnabled: true };

    // Act
    const result = applyAppearance(input);

    // Assert
    expect(result.accentColor).toBe("blue");
    expect(result.density).toBe("comfortable");
    expect(result.theme).toBe("light");
    expect(result.animationsEnabled).toBe(true);
  });

  it("sets data-accent attribute to the resolved accent color", () => {
    applyAppearance({ accentColor: "rose" });
    expect(dataAttr("data-accent")).toBe("rose");
  });

  it("sets --user-accent CSS variable to the correct hex for 'blue'", () => {
    applyAppearance({ accentColor: "blue" });
    expect(cssVar("--user-accent")).toBe("#2f6bff");
  });

  it("sets --user-accent CSS variable to the correct hex for 'indigo'", () => {
    applyAppearance({ accentColor: "indigo" });
    expect(cssVar("--user-accent")).toBe("#6366f1");
  });

  it("sets --user-accent CSS variable to the correct hex for 'violet'", () => {
    applyAppearance({ accentColor: "violet" });
    expect(cssVar("--user-accent")).toBe("#8b5cf6");
  });

  it("sets --user-accent CSS variable to the correct hex for 'cyan'", () => {
    applyAppearance({ accentColor: "cyan" });
    expect(cssVar("--user-accent")).toBe("#06b6d4");
  });

  it("sets --user-accent CSS variable to the correct hex for 'emerald'", () => {
    applyAppearance({ accentColor: "emerald" });
    expect(cssVar("--user-accent")).toBe("#10b981");
  });

  it("sets --user-accent CSS variable to the correct hex for 'amber'", () => {
    applyAppearance({ accentColor: "amber" });
    expect(cssVar("--user-accent")).toBe("#f59e0b");
  });

  it("sets --user-accent CSS variable to the correct hex for 'rose'", () => {
    applyAppearance({ accentColor: "rose" });
    expect(cssVar("--user-accent")).toBe("#f43f5e");
  });

  it("sets data-density attribute", () => {
    applyAppearance({ density: "compact" });
    expect(dataAttr("data-density")).toBe("compact");
  });

  it("sets --density-scale to 0.75 for compact", () => {
    applyAppearance({ density: "compact" });
    expect(cssVar("--density-scale")).toBe("0.75");
  });

  it("sets --density-scale to 1 for comfortable", () => {
    applyAppearance({ density: "comfortable" });
    expect(cssVar("--density-scale")).toBe("1");
  });

  it("sets --density-scale to 1.25 for spacious", () => {
    applyAppearance({ density: "spacious" });
    expect(cssVar("--density-scale")).toBe("1.25");
  });

  it("sets data-theme attribute", () => {
    applyAppearance({ theme: "dark" });
    expect(dataAttr("data-theme")).toBe("dark");
  });

  it("sets data-animations='on' when animationsEnabled is true", () => {
    applyAppearance({ animationsEnabled: true });
    expect(dataAttr("data-animations")).toBe("on");
  });

  it("sets data-animations='off' when animationsEnabled is false", () => {
    applyAppearance({ animationsEnabled: false });
    expect(dataAttr("data-animations")).toBe("off");
  });

  it("sets --motion-allowed to '1' when animationsEnabled is true", () => {
    applyAppearance({ animationsEnabled: true });
    expect(cssVar("--motion-allowed")).toBe("1");
  });

  it("sets --motion-allowed to '0' when animationsEnabled is false", () => {
    applyAppearance({ animationsEnabled: false });
    expect(cssVar("--motion-allowed")).toBe("0");
  });

  it("sets data-compact-numbers='on' when compactNumbers is true", () => {
    applyAppearance({ compactNumbers: true });
    expect(dataAttr("data-compact-numbers")).toBe("on");
  });

  it("sets data-compact-numbers='off' when compactNumbers is falsy/undefined", () => {
    applyAppearance({ compactNumbers: false });
    expect(dataAttr("data-compact-numbers")).toBe("off");
  });

  it("sets data-compact-numbers='off' when compactNumbers is undefined", () => {
    applyAppearance({});
    expect(dataAttr("data-compact-numbers")).toBe("off");
  });

  // ── defaults / fallback paths ─────────────────────────────────────────────

  it("falls back to accentColor='blue' when accentColor is undefined", () => {
    const result = applyAppearance({});
    expect(result.accentColor).toBe("blue");
    expect(dataAttr("data-accent")).toBe("blue");
  });

  it("falls back to accentColor='blue' when accentColor is invalid", () => {
    const result = applyAppearance({ accentColor: "hotpink" });
    expect(result.accentColor).toBe("blue");
  });

  it("falls back to density='comfortable' when density is undefined", () => {
    const result = applyAppearance({});
    expect(result.density).toBe("comfortable");
  });

  it("falls back to density='comfortable' when density is invalid", () => {
    const result = applyAppearance({ density: "ultra-dense" });
    expect(result.density).toBe("comfortable");
  });

  it("falls back to theme='system' when theme is undefined", () => {
    const result = applyAppearance({});
    expect(result.theme).toBe("system");
  });

  it("falls back to theme='system' when theme is invalid", () => {
    const result = applyAppearance({ theme: "midnight" });
    expect(result.theme).toBe("system");
  });

  it("animationsEnabled defaults to true when omitted", () => {
    const result = applyAppearance({});
    expect(result.animationsEnabled).toBe(true);
  });

  it("animationsEnabled is true when explicitly set to true", () => {
    const result = applyAppearance({ animationsEnabled: true });
    expect(result.animationsEnabled).toBe(true);
  });

  it("animationsEnabled is false when explicitly set to false", () => {
    const result = applyAppearance({ animationsEnabled: false });
    expect(result.animationsEnabled).toBe(false);
  });

  // ── all valid theme values ────────────────────────────────────────────────

  it("applies theme='light' correctly", () => {
    const result = applyAppearance({ theme: "light" });
    expect(result.theme).toBe("light");
    expect(dataAttr("data-theme")).toBe("light");
  });

  it("applies theme='dark' correctly", () => {
    const result = applyAppearance({ theme: "dark" });
    expect(result.theme).toBe("dark");
    expect(dataAttr("data-theme")).toBe("dark");
  });

  it("applies theme='system' correctly", () => {
    const result = applyAppearance({ theme: "system" });
    expect(result.theme).toBe("system");
    expect(dataAttr("data-theme")).toBe("system");
  });

  // ── no-document guard ─────────────────────────────────────────────────────

  it("does not throw when document is undefined (SSR guard)", () => {
    // Arrange: temporarily hide document
    const origDoc = global.document;
    // @ts-expect-error testing SSR scenario
    global.document = undefined;

    // Act / Assert
    expect(() => applyAppearance({ accentColor: "blue" })).not.toThrow();

    // Restore
    global.document = origDoc;
  });
});

// ─── resolvePerformanceConfig ─────────────────────────────────────────────────

describe("resolvePerformanceConfig", () => {
  // ── happy paths ──────────────────────────────────────────────────────────

  it("returns the provided valid values unchanged", () => {
    // Arrange
    const input: PerformanceInput = {
      duckdbWorkers: 2,
      maxMemoryMB: 1024,
      virtualizeThreshold: 200,
      cacheQueries: false,
      enableWASMStreaming: false,
    };

    // Act
    const result = resolvePerformanceConfig(input);

    // Assert
    expect(result.duckdbWorkers).toBe(2);
    expect(result.maxMemoryMB).toBe(1024);
    expect(result.virtualizeThreshold).toBe(200);
    expect(result.cacheQueries).toBe(false);
    expect(result.enableWASMStreaming).toBe(false);
  });

  it("coerces string values to numbers for duckdbWorkers", () => {
    const result = resolvePerformanceConfig({ duckdbWorkers: "3" });
    expect(result.duckdbWorkers).toBe(3);
  });

  it("coerces string values to numbers for maxMemoryMB", () => {
    const result = resolvePerformanceConfig({ maxMemoryMB: "768" });
    expect(result.maxMemoryMB).toBe(768);
  });

  it("coerces string values to numbers for virtualizeThreshold", () => {
    const result = resolvePerformanceConfig({ virtualizeThreshold: "1000" });
    expect(result.virtualizeThreshold).toBe(1000);
  });

  // ── defaults ─────────────────────────────────────────────────────────────

  it("uses default duckdbWorkers=4 when omitted", () => {
    const result = resolvePerformanceConfig({});
    expect(result.duckdbWorkers).toBe(4);
  });

  it("uses default maxMemoryMB=512 when omitted", () => {
    const result = resolvePerformanceConfig({});
    expect(result.maxMemoryMB).toBe(512);
  });

  it("uses default virtualizeThreshold=500 when omitted", () => {
    const result = resolvePerformanceConfig({});
    expect(result.virtualizeThreshold).toBe(500);
  });

  it("cacheQueries defaults to true when omitted", () => {
    const result = resolvePerformanceConfig({});
    expect(result.cacheQueries).toBe(true);
  });

  it("enableWASMStreaming defaults to true when omitted", () => {
    const result = resolvePerformanceConfig({});
    expect(result.enableWASMStreaming).toBe(true);
  });

  // ── clamping / fallback paths ─────────────────────────────────────────────

  it("clamps duckdbWorkers above max (8) → falls back to field default 4", () => {
    // Values out of range are replaced by the schema fallback
    const result = resolvePerformanceConfig({ duckdbWorkers: 99 });
    expect(result.duckdbWorkers).toBe(4);
  });

  it("clamps duckdbWorkers below min (1) → falls back to field default 4", () => {
    const result = resolvePerformanceConfig({ duckdbWorkers: 0 });
    expect(result.duckdbWorkers).toBe(4);
  });

  it("clamps maxMemoryMB above max (4096) → falls back to field default 512", () => {
    const result = resolvePerformanceConfig({ maxMemoryMB: 99999 });
    expect(result.maxMemoryMB).toBe(512);
  });

  it("clamps maxMemoryMB below min (256) → falls back to field default 512", () => {
    const result = resolvePerformanceConfig({ maxMemoryMB: 10 });
    expect(result.maxMemoryMB).toBe(512);
  });

  it("clamps virtualizeThreshold above max (5000) → falls back to field default 500", () => {
    const result = resolvePerformanceConfig({ virtualizeThreshold: 99999 });
    expect(result.virtualizeThreshold).toBe(500);
  });

  it("clamps virtualizeThreshold below min (50) → falls back to field default 500", () => {
    const result = resolvePerformanceConfig({ virtualizeThreshold: 1 });
    expect(result.virtualizeThreshold).toBe(500);
  });

  it("returns field default for NaN duckdbWorkers", () => {
    const result = resolvePerformanceConfig({ duckdbWorkers: NaN });
    expect(result.duckdbWorkers).toBe(4);
  });

  it("returns field default for NaN maxMemoryMB", () => {
    const result = resolvePerformanceConfig({ maxMemoryMB: NaN });
    expect(result.maxMemoryMB).toBe(512);
  });

  it("returns field default for NaN virtualizeThreshold", () => {
    const result = resolvePerformanceConfig({ virtualizeThreshold: NaN });
    expect(result.virtualizeThreshold).toBe(500);
  });

  it("returns field default for non-numeric string duckdbWorkers", () => {
    const result = resolvePerformanceConfig({ duckdbWorkers: "abc" });
    expect(result.duckdbWorkers).toBe(4);
  });

  // ── boundary values (exact min/max should be valid) ───────────────────────

  it("accepts duckdbWorkers=1 (min boundary)", () => {
    const result = resolvePerformanceConfig({ duckdbWorkers: 1 });
    expect(result.duckdbWorkers).toBe(1);
  });

  it("accepts duckdbWorkers=8 (max boundary)", () => {
    const result = resolvePerformanceConfig({ duckdbWorkers: 8 });
    expect(result.duckdbWorkers).toBe(8);
  });

  it("accepts maxMemoryMB=256 (min boundary)", () => {
    const result = resolvePerformanceConfig({ maxMemoryMB: 256 });
    expect(result.maxMemoryMB).toBe(256);
  });

  it("accepts maxMemoryMB=4096 (max boundary)", () => {
    const result = resolvePerformanceConfig({ maxMemoryMB: 4096 });
    expect(result.maxMemoryMB).toBe(4096);
  });

  it("accepts virtualizeThreshold=50 (min boundary)", () => {
    const result = resolvePerformanceConfig({ virtualizeThreshold: 50 });
    expect(result.virtualizeThreshold).toBe(50);
  });

  it("accepts virtualizeThreshold=5000 (max boundary)", () => {
    const result = resolvePerformanceConfig({ virtualizeThreshold: 5000 });
    expect(result.virtualizeThreshold).toBe(5000);
  });

  // ── boolean flags ─────────────────────────────────────────────────────────

  it("cacheQueries=false is preserved", () => {
    const result = resolvePerformanceConfig({ cacheQueries: false });
    expect(result.cacheQueries).toBe(false);
  });

  it("enableWASMStreaming=false is preserved", () => {
    const result = resolvePerformanceConfig({ enableWASMStreaming: false });
    expect(result.enableWASMStreaming).toBe(false);
  });
});

// ─── getRuntimePerformanceConfig / subscribePerformanceConfig ─────────────────

describe("getRuntimePerformanceConfig", () => {
  it("returns a RuntimePerformanceConfig with valid defaults initially", () => {
    // Act
    const config = getRuntimePerformanceConfig();

    // Assert
    expect(config).toMatchObject({
      duckdbWorkers: expect.any(Number),
      maxMemoryMB: expect.any(Number),
      virtualizeThreshold: expect.any(Number),
      cacheQueries: expect.any(Boolean),
      enableWASMStreaming: expect.any(Boolean),
    });
  });

  it("returns the config published by the most recent applySettings call", () => {
    // Arrange
    applySettings({
      appearance: {},
      performance: { duckdbWorkers: 6, maxMemoryMB: 2048, virtualizeThreshold: 300 },
    });

    // Act
    const config = getRuntimePerformanceConfig();

    // Assert
    expect(config.duckdbWorkers).toBe(6);
    expect(config.maxMemoryMB).toBe(2048);
    expect(config.virtualizeThreshold).toBe(300);
  });
});

describe("subscribePerformanceConfig", () => {
  it("calls the listener with the new config when applySettings is called", () => {
    // Arrange
    const listener = vi.fn();
    const unsub = subscribePerformanceConfig(listener);

    // Act
    applySettings({
      appearance: {},
      performance: { duckdbWorkers: 2, maxMemoryMB: 256 },
    });

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ duckdbWorkers: 2, maxMemoryMB: 256 }),
    );

    // Cleanup
    unsub();
  });

  it("stops calling the listener after unsubscribe", () => {
    // Arrange
    const listener = vi.fn();
    const unsub = subscribePerformanceConfig(listener);
    unsub();

    // Act
    applySettings({ appearance: {}, performance: { duckdbWorkers: 3 } });

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple concurrent listeners and calls all of them", () => {
    // Arrange
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = subscribePerformanceConfig(listenerA);
    const unsubB = subscribePerformanceConfig(listenerB);

    // Act
    applySettings({ appearance: {}, performance: { duckdbWorkers: 5 } });

    // Assert
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    // Cleanup
    unsubA();
    unsubB();
  });

  it("unsubscribing one listener does not affect the other", () => {
    // Arrange
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = subscribePerformanceConfig(listenerA);
    const unsubB = subscribePerformanceConfig(listenerB);
    unsubA(); // only remove A

    // Act
    applySettings({ appearance: {}, performance: { duckdbWorkers: 7 } });

    // Assert
    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledTimes(1);

    // Cleanup
    unsubB();
  });

  it("calling unsub twice does not throw", () => {
    // Arrange
    const listener = vi.fn();
    const unsub = subscribePerformanceConfig(listener);

    // Act / Assert
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

// ─── applySettings (combined) ─────────────────────────────────────────────────

describe("applySettings", () => {
  beforeEach(() => cleanRoot());
  afterEach(() => cleanRoot());

  it("returns an AppliedSettings object containing both appearance and performance", () => {
    // Arrange
    const input = {
      appearance: { accentColor: "emerald" as const, density: "spacious" as const, theme: "dark" as const },
      performance: { duckdbWorkers: 4, maxMemoryMB: 1024 },
    };

    // Act
    const result = applySettings(input);

    // Assert
    expect(result).toHaveProperty("appearance");
    expect(result).toHaveProperty("performance");
    expect(result.appearance.accentColor).toBe("emerald");
    expect(result.performance.maxMemoryMB).toBe(1024);
  });

  it("applies appearance DOM effects (data-accent) as a side effect", () => {
    applySettings({ appearance: { accentColor: "amber" }, performance: {} });
    expect(dataAttr("data-accent")).toBe("amber");
  });

  it("updates the runtime singleton (getRuntimePerformanceConfig) as a side effect", () => {
    applySettings({ appearance: {}, performance: { duckdbWorkers: 8, maxMemoryMB: 4096 } });
    const live = getRuntimePerformanceConfig();
    expect(live.duckdbWorkers).toBe(8);
    expect(live.maxMemoryMB).toBe(4096);
  });

  it("handles empty appearance and performance inputs without throwing", () => {
    expect(() => applySettings({ appearance: {}, performance: {} })).not.toThrow();
  });

  it("returns cacheQueries=true by default in the combined call", () => {
    const result = applySettings({ appearance: {}, performance: {} });
    expect(result.performance.cacheQueries).toBe(true);
  });

  it("propagates cacheQueries=false through the combined call", () => {
    const result = applySettings({ appearance: {}, performance: { cacheQueries: false } });
    expect(result.performance.cacheQueries).toBe(false);
  });

  it("propagates enableWASMStreaming=false through the combined call", () => {
    const result = applySettings({ appearance: {}, performance: { enableWASMStreaming: false } });
    expect(result.performance.enableWASMStreaming).toBe(false);
  });

  it("notifies subscribers from the combined call", () => {
    // Arrange
    const listener = vi.fn();
    const unsub = subscribePerformanceConfig(listener);

    // Act
    applySettings({ appearance: {}, performance: { virtualizeThreshold: 250 } });

    // Assert
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ virtualizeThreshold: 250 }),
    );

    // Cleanup
    unsub();
  });

  it("sequential calls update the runtime singleton to the latest config", () => {
    applySettings({ appearance: {}, performance: { duckdbWorkers: 1 } });
    applySettings({ appearance: {}, performance: { duckdbWorkers: 6 } });

    expect(getRuntimePerformanceConfig().duckdbWorkers).toBe(6);
  });
});
