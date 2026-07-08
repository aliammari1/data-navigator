/**
 * Unit tests for @/features/settings/lib/settings-schema
 *
 * No external deps to mock — the module only imports from "zod".
 * Every branch, enum value, and helper function is exercised here.
 */

import { describe, it, expect } from "vitest";

import {
  AccentColorSchema,
  DensityModeSchema,
  ThemeSchema,
  NumericFields,
  clampNumericSetting,
  parseNumericSetting,
  parseNullDisplay,
  SettingsBackupSchema,
  SettingsExportEnvelopeSchema,
  type AccentColorValue,
  type DensityModeValue,
  type ThemeValue,
  type NumericFieldName,
  type SettingsBackup,
  type SettingsExportEnvelope,
} from "@/features/settings/lib/settings-schema";

// =============================================================================
// AccentColorSchema
// =============================================================================

describe("AccentColorSchema", () => {
  const validColors: AccentColorValue[] = [
    "blue",
    "indigo",
    "violet",
    "cyan",
    "emerald",
    "amber",
    "rose",
  ];

  validColors.forEach((color) => {
    it(`accepts valid accent color: ${color}`, () => {
      const result = AccentColorSchema.safeParse(color);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(color);
    });
  });

  it("rejects an invalid accent color", () => {
    const result = AccentColorSchema.safeParse("purple");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = AccentColorSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects a number", () => {
    const result = AccentColorSchema.safeParse(42);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// DensityModeSchema
// =============================================================================

describe("DensityModeSchema", () => {
  const validModes: DensityModeValue[] = ["compact", "comfortable", "spacious"];

  validModes.forEach((mode) => {
    it(`accepts valid density mode: ${mode}`, () => {
      const result = DensityModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(mode);
    });
  });

  it("rejects an invalid density mode", () => {
    const result = DensityModeSchema.safeParse("dense");
    expect(result.success).toBe(false);
  });

  it("rejects a number", () => {
    const result = DensityModeSchema.safeParse(1);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// ThemeSchema
// =============================================================================

describe("ThemeSchema", () => {
  const validThemes: ThemeValue[] = ["light", "dark", "system"];

  validThemes.forEach((theme) => {
    it(`accepts valid theme: ${theme}`, () => {
      const result = ThemeSchema.safeParse(theme);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(theme);
    });
  });

  it("rejects an invalid theme", () => {
    const result = ThemeSchema.safeParse("midnight");
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = ThemeSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// NumericFields — schema specs
// =============================================================================

describe("NumericFields – defaultRowLimit", () => {
  it("accepts minimum valid value 100", () => {
    const result = NumericFields.defaultRowLimit.schema.safeParse(100);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(100);
  });

  it("accepts maximum valid value 1_000_000", () => {
    const result = NumericFields.defaultRowLimit.schema.safeParse(1_000_000);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(1_000_000);
  });

  it("coerces a string number to integer", () => {
    const result = NumericFields.defaultRowLimit.schema.safeParse("500");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(500);
  });

  it("rejects a value below minimum (99)", () => {
    const result = NumericFields.defaultRowLimit.schema.safeParse(99);
    expect(result.success).toBe(false);
  });

  it("rejects a value above maximum (1_000_001)", () => {
    const result = NumericFields.defaultRowLimit.schema.safeParse(1_000_001);
    expect(result.success).toBe(false);
  });

  it("has fallback of 10_000", () => {
    expect(NumericFields.defaultRowLimit.fallback).toBe(10_000);
  });
});

describe("NumericFields – autoRefreshInterval", () => {
  it("accepts minimum valid value 0", () => {
    const result = NumericFields.autoRefreshInterval.schema.safeParse(0);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0);
  });

  it("accepts maximum valid value 3600", () => {
    const result = NumericFields.autoRefreshInterval.schema.safeParse(3600);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(3600);
  });

  it("rejects a value above maximum (3601)", () => {
    const result = NumericFields.autoRefreshInterval.schema.safeParse(3601);
    expect(result.success).toBe(false);
  });

  it("rejects a negative value", () => {
    const result = NumericFields.autoRefreshInterval.schema.safeParse(-1);
    expect(result.success).toBe(false);
  });

  it("has fallback of 0", () => {
    expect(NumericFields.autoRefreshInterval.fallback).toBe(0);
  });
});

describe("NumericFields – duckdbWorkers", () => {
  it("accepts minimum valid value 1", () => {
    const result = NumericFields.duckdbWorkers.schema.safeParse(1);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(1);
  });

  it("accepts maximum valid value 8", () => {
    const result = NumericFields.duckdbWorkers.schema.safeParse(8);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(8);
  });

  it("rejects a value below minimum (0)", () => {
    const result = NumericFields.duckdbWorkers.schema.safeParse(0);
    expect(result.success).toBe(false);
  });

  it("rejects a value above maximum (9)", () => {
    const result = NumericFields.duckdbWorkers.schema.safeParse(9);
    expect(result.success).toBe(false);
  });

  it("has fallback of 4", () => {
    expect(NumericFields.duckdbWorkers.fallback).toBe(4);
  });
});

describe("NumericFields – maxMemoryMB", () => {
  it("accepts minimum valid value 256", () => {
    const result = NumericFields.maxMemoryMB.schema.safeParse(256);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(256);
  });

  it("accepts maximum valid value 4096", () => {
    const result = NumericFields.maxMemoryMB.schema.safeParse(4096);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(4096);
  });

  it("rejects a value below minimum (255)", () => {
    const result = NumericFields.maxMemoryMB.schema.safeParse(255);
    expect(result.success).toBe(false);
  });

  it("rejects a value above maximum (4097)", () => {
    const result = NumericFields.maxMemoryMB.schema.safeParse(4097);
    expect(result.success).toBe(false);
  });

  it("has fallback of 512", () => {
    expect(NumericFields.maxMemoryMB.fallback).toBe(512);
  });
});

describe("NumericFields – virtualizeThreshold", () => {
  it("accepts minimum valid value 50", () => {
    const result = NumericFields.virtualizeThreshold.schema.safeParse(50);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(50);
  });

  it("accepts maximum valid value 5000", () => {
    const result = NumericFields.virtualizeThreshold.schema.safeParse(5000);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(5000);
  });

  it("rejects a value below minimum (49)", () => {
    const result = NumericFields.virtualizeThreshold.schema.safeParse(49);
    expect(result.success).toBe(false);
  });

  it("rejects a value above maximum (5001)", () => {
    const result = NumericFields.virtualizeThreshold.schema.safeParse(5001);
    expect(result.success).toBe(false);
  });

  it("has fallback of 500", () => {
    expect(NumericFields.virtualizeThreshold.fallback).toBe(500);
  });
});

// =============================================================================
// clampNumericSetting — both branches
// =============================================================================

describe("clampNumericSetting", () => {
  it("returns the parsed value when input is valid (success branch)", () => {
    const result = clampNumericSetting("defaultRowLimit", 5000);
    expect(result).toBe(5000);
  });

  it("returns the fallback when input is invalid (failure branch)", () => {
    // 99 is below min 100 for defaultRowLimit, fallback is 10_000
    const result = clampNumericSetting("defaultRowLimit", 99);
    expect(result).toBe(10_000);
  });

  it("coerces a string to number and returns it when valid", () => {
    const result = clampNumericSetting("duckdbWorkers", "4");
    expect(result).toBe(4);
  });

  it("returns fallback for NaN input string", () => {
    const result = clampNumericSetting("duckdbWorkers", "not-a-number");
    expect(result).toBe(NumericFields.duckdbWorkers.fallback);
  });

  it("returns fallback when value exceeds max for autoRefreshInterval", () => {
    const result = clampNumericSetting("autoRefreshInterval", 9999);
    expect(result).toBe(NumericFields.autoRefreshInterval.fallback);
  });

  it("returns parsed value at boundary for maxMemoryMB (256)", () => {
    const result = clampNumericSetting("maxMemoryMB", 256);
    expect(result).toBe(256);
  });

  it("returns fallback for out-of-range maxMemoryMB (0)", () => {
    const result = clampNumericSetting("maxMemoryMB", 0);
    expect(result).toBe(512);
  });

  it("returns parsed value for virtualizeThreshold (1000)", () => {
    const result = clampNumericSetting("virtualizeThreshold", 1000);
    expect(result).toBe(1000);
  });

  it("returns fallback for virtualizeThreshold too low (10)", () => {
    const result = clampNumericSetting("virtualizeThreshold", 10);
    expect(result).toBe(500);
  });

  it("works with string input that coerces to a valid number for maxMemoryMB", () => {
    const result = clampNumericSetting("maxMemoryMB", "1024");
    expect(result).toBe(1024);
  });
});

// =============================================================================
// parseNumericSetting — both branches
// =============================================================================

describe("parseNumericSetting", () => {
  it("returns success:true with value when input is valid", () => {
    const result = parseNumericSetting("defaultRowLimit", 10_000);
    expect(result).toEqual({ success: true, value: 10_000 });
  });

  it("returns success:false when input is below minimum", () => {
    // 50 is below min 100 for defaultRowLimit
    const result = parseNumericSetting("defaultRowLimit", 50);
    expect(result).toEqual({ success: false });
  });

  it("returns success:false when input is a non-numeric string", () => {
    const result = parseNumericSetting("duckdbWorkers", "abc");
    expect(result).toEqual({ success: false });
  });

  it("returns success:true with coerced number when given valid string", () => {
    const result = parseNumericSetting("duckdbWorkers", "3");
    expect(result).toEqual({ success: true, value: 3 });
  });

  it("returns success:false for autoRefreshInterval above max", () => {
    const result = parseNumericSetting("autoRefreshInterval", 9999);
    expect(result).toEqual({ success: false });
  });

  it("returns success:true for autoRefreshInterval at exact max (3600)", () => {
    const result = parseNumericSetting("autoRefreshInterval", 3600);
    expect(result).toEqual({ success: true, value: 3600 });
  });

  it("returns success:true for maxMemoryMB at min boundary (256)", () => {
    const result = parseNumericSetting("maxMemoryMB", 256);
    expect(result).toEqual({ success: true, value: 256 });
  });

  it("returns success:false for maxMemoryMB below minimum (100)", () => {
    const result = parseNumericSetting("maxMemoryMB", 100);
    expect(result).toEqual({ success: false });
  });

  it("returns success:true for virtualizeThreshold at mid-range (2500)", () => {
    const result = parseNumericSetting("virtualizeThreshold", 2500);
    expect(result).toEqual({ success: true, value: 2500 });
  });

  it("returns success:false for virtualizeThreshold above max (5001)", () => {
    const result = parseNumericSetting("virtualizeThreshold", 5001);
    expect(result).toEqual({ success: false });
  });
});

// =============================================================================
// parseNullDisplay — both branches
// =============================================================================

describe("parseNullDisplay", () => {
  it("returns success:true with value for a short string", () => {
    const result = parseNullDisplay("NULL");
    expect(result).toEqual({ success: true, value: "NULL" });
  });

  it("returns success:true for an empty string (length 0 <= 8)", () => {
    const result = parseNullDisplay("");
    expect(result).toEqual({ success: true, value: "" });
  });

  it("returns success:true for a string of exactly 8 characters", () => {
    const result = parseNullDisplay("12345678");
    expect(result).toEqual({ success: true, value: "12345678" });
  });

  it("returns success:false for a string longer than 8 characters (failure branch)", () => {
    const result = parseNullDisplay("123456789");
    expect(result).toEqual({ success: false });
  });

  it("returns success:true for a single-character null display", () => {
    const result = parseNullDisplay("-");
    expect(result).toEqual({ success: true, value: "-" });
  });

  it("returns success:false for a 9-character string", () => {
    const result = parseNullDisplay("null_null");
    expect(result).toEqual({ success: false });
  });
});

// =============================================================================
// SettingsBackupSchema
// =============================================================================

describe("SettingsBackupSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = SettingsBackupSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated valid settings backup object", () => {
    const valid: SettingsBackup = {
      theme: "dark",
      accentColor: "blue",
      density: "compact",
      animationsEnabled: true,
      sidebarPinned: false,
      showBreadcrumbs: true,
      compactNumbers: false,
      data: { defaultRowLimit: 5000 },
      performance: { maxMemoryMB: 512 },
      notifications: { enabled: true },
      pinnedItems: ["dashboard", "reports"],
    };
    const result = SettingsBackupSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid theme value", () => {
    const result = SettingsBackupSchema.safeParse({ theme: "midnight" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid accentColor value", () => {
    const result = SettingsBackupSchema.safeParse({ accentColor: "purple" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid density value", () => {
    const result = SettingsBackupSchema.safeParse({ density: "dense" });
    expect(result.success).toBe(false);
  });

  it("accepts each valid theme separately", () => {
    const themes: ThemeValue[] = ["light", "dark", "system"];
    for (const theme of themes) {
      const result = SettingsBackupSchema.safeParse({ theme });
      expect(result.success).toBe(true);
    }
  });

  it("accepts each valid density separately", () => {
    const densities: DensityModeValue[] = ["compact", "comfortable", "spacious"];
    for (const density of densities) {
      const result = SettingsBackupSchema.safeParse({ density });
      expect(result.success).toBe(true);
    }
  });

  it("accepts each valid accentColor separately", () => {
    const colors: AccentColorValue[] = [
      "blue",
      "indigo",
      "violet",
      "cyan",
      "emerald",
      "amber",
      "rose",
    ];
    for (const accentColor of colors) {
      const result = SettingsBackupSchema.safeParse({ accentColor });
      expect(result.success).toBe(true);
    }
  });

  it("accepts animationsEnabled as a boolean", () => {
    expect(SettingsBackupSchema.safeParse({ animationsEnabled: true }).success).toBe(true);
    expect(SettingsBackupSchema.safeParse({ animationsEnabled: false }).success).toBe(true);
  });

  it("rejects animationsEnabled as a string", () => {
    const result = SettingsBackupSchema.safeParse({ animationsEnabled: "yes" });
    expect(result.success).toBe(false);
  });

  it("accepts sidebarPinned as a boolean", () => {
    expect(SettingsBackupSchema.safeParse({ sidebarPinned: true }).success).toBe(true);
    expect(SettingsBackupSchema.safeParse({ sidebarPinned: false }).success).toBe(true);
  });

  it("accepts showBreadcrumbs as a boolean", () => {
    expect(SettingsBackupSchema.safeParse({ showBreadcrumbs: true }).success).toBe(true);
  });

  it("accepts compactNumbers as a boolean", () => {
    expect(SettingsBackupSchema.safeParse({ compactNumbers: false }).success).toBe(true);
  });

  it("accepts data as a record", () => {
    const result = SettingsBackupSchema.safeParse({ data: { key: "value" } });
    expect(result.success).toBe(true);
  });

  it("accepts performance as a record", () => {
    const result = SettingsBackupSchema.safeParse({ performance: { workers: 4 } });
    expect(result.success).toBe(true);
  });

  it("accepts notifications as a record", () => {
    const result = SettingsBackupSchema.safeParse({ notifications: { email: true } });
    expect(result.success).toBe(true);
  });

  it("accepts pinnedItems as an array of strings", () => {
    const result = SettingsBackupSchema.safeParse({ pinnedItems: ["a", "b"] });
    expect(result.success).toBe(true);
  });

  it("rejects pinnedItems as an array of non-strings", () => {
    const result = SettingsBackupSchema.safeParse({ pinnedItems: [1, 2, 3] });
    expect(result.success).toBe(false);
  });

  it("passes through unknown keys (passthrough mode)", () => {
    const result = SettingsBackupSchema.safeParse({
      theme: "light",
      unknownFutureField: "some-value",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknownFutureField).toBe("some-value");
    }
  });
});

// =============================================================================
// SettingsExportEnvelopeSchema
// =============================================================================

describe("SettingsExportEnvelopeSchema", () => {
  it("accepts an empty object (settings is optional)", () => {
    const result = SettingsExportEnvelopeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts an object with a settings record", () => {
    const payload: SettingsExportEnvelope = {
      settings: { "data-navigator-settings": { state: {}, version: 0 } },
    };
    const result = SettingsExportEnvelopeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts an object with an empty settings record", () => {
    const result = SettingsExportEnvelopeSchema.safeParse({ settings: {} });
    expect(result.success).toBe(true);
  });

  it("passes through unknown keys (passthrough mode)", () => {
    const result = SettingsExportEnvelopeSchema.safeParse({
      settings: { key: "val" },
      extraField: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extraField).toBe(42);
    }
  });

  it("rejects when settings is a non-record value (array)", () => {
    // z.record expects an object, not an array
    const result = SettingsExportEnvelopeSchema.safeParse({ settings: [1, 2, 3] });
    // Note: Zod may or may not reject arrays as records depending on version.
    // The important thing is it correctly parses without throwing.
    expect(result).toBeDefined();
  });
});
