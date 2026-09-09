/**
 * Single source of truth for settings validation, coercion and clamping.
 *
 * The Zustand settings store (`@/core/stores/settings-store`) is shared code and
 * intentionally untyped beyond plain `number`/`string` fields, so numeric inputs
 * could previously persist `NaN`/out-of-range values straight through to DuckDB
 * and the virtualization layer. This schema is the feature-local guard: every
 * numeric/text control in the Settings UI parses its draft value through the
 * matching field here before committing it to the store, and the backup/restore
 * flow validates imported JSON against it so a hand-edited file can never poison
 * the store.
 *
 * It deliberately mirrors the store's runtime shape (see `DataSettings`,
 * `PerformanceSettings`, `NotificationSettings`) without importing it, so the two
 * stay decoupled — the schema only ever *narrows* values the store already
 * accepts.
 */

import { z } from "zod";

export const AccentColorSchema = z.enum([
  "blue",
  "indigo",
  "violet",
  "cyan",
  "emerald",
  "amber",
  "rose",
]);
export type AccentColorValue = z.infer<typeof AccentColorSchema>;

export const DensityModeSchema = z.enum(["compact", "comfortable", "spacious"]);
export type DensityModeValue = z.infer<typeof DensityModeSchema>;

export const ThemeSchema = z.enum(["light", "dark", "system"]);
export type ThemeValue = z.infer<typeof ThemeSchema>;

/**
 * Numeric field specs. Each `schema` uses `z.coerce.number()` so a string draft
 * from an `<input>` is converted, then validated against an integer range.
 * `fallback` is used by the clamp helper to guarantee an in-range value.
 */
interface NumericFieldSpec {
  // `z.coerce.number()` yields a `ZodCoercedNumber`, not a plain `ZodNumber`; accept
  // any schema whose parsed output is a number (only `.safeParse` is used downstream).
  schema: z.ZodType<number>;
  fallback: number;
}

export const NumericFields = {
  defaultRowLimit: {
    schema: z.coerce.number().int().min(100).max(1_000_000),
    fallback: 10_000,
  },
  autoRefreshInterval: {
    schema: z.coerce.number().int().min(0).max(3600),
    fallback: 0,
  },
  duckdbWorkers: {
    schema: z.coerce.number().int().min(1).max(8),
    fallback: 4,
  },
  maxMemoryMB: {
    schema: z.coerce.number().int().min(256).max(4096),
    fallback: 512,
  },
  virtualizeThreshold: {
    schema: z.coerce.number().int().min(50).max(5000),
    fallback: 500,
  },
} satisfies Record<string, NumericFieldSpec>;

export type NumericFieldName = keyof typeof NumericFields;

/**
 * Clamp + coerce a raw input value (string or number) for a numeric setting.
 * Falls back to the field default when the value is invalid/out-of-range, so the
 * store can never hold `NaN`/out-of-range numbers.
 */
export function clampNumericSetting(field: NumericFieldName, raw: string | number): number {
  const { schema, fallback } = NumericFields[field];
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

/**
 * Validate a raw input value without falling back to a default. Returns
 * `success: false` when the value is invalid so the UI can revert the draft to
 * the last committed value instead of silently snapping to a default.
 */
export function parseNumericSetting(
  field: NumericFieldName,
  raw: string | number,
): { success: true; value: number } | { success: false } {
  const parsed = NumericFields[field].schema.safeParse(raw);
  return parsed.success ? { success: true, value: parsed.data } : { success: false };
}

const NullDisplaySchema = z.string().max(8);

export function parseNullDisplay(
  raw: string,
): { success: true; value: string } | { success: false } {
  const parsed = NullDisplaySchema.safeParse(raw);
  return parsed.success ? { success: true, value: parsed.data } : { success: false };
}

/**
 * Durable settings payload shape used by the backup/restore flow. It is
 * deliberately permissive (`.passthrough()` / partial) because the export
 * surfaces the full `app_setting` `settings` namespace, which may contain
 * fields this build does not know about yet — we validate the envelope and the
 * known numeric fields, but never reject unknown keys (forward-compat).
 */
export const SettingsBackupSchema = z
  .object({
    theme: ThemeSchema.optional(),
    accentColor: AccentColorSchema.optional(),
    density: DensityModeSchema.optional(),
    animationsEnabled: z.boolean().optional(),
    sidebarPinned: z.boolean().optional(),
    showBreadcrumbs: z.boolean().optional(),
    compactNumbers: z.boolean().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    performance: z.record(z.string(), z.unknown()).optional(),
    notifications: z.record(z.string(), z.unknown()).optional(),
    pinnedItems: z.array(z.string()).optional(),
  })
  .passthrough();

export type SettingsBackup = z.infer<typeof SettingsBackupSchema>;

/**
 * Envelope produced by `exportAppSettingsRemote()` →
 * `{ [namespace]: { [key]: value } }`. The Zustand persist middleware stores the
 * whole settings blob under `settings.settings` (namespace "settings", key
 * "data-navigator-settings"), wrapped in the persist `{ state, version }` shape.
 */
export const SettingsExportEnvelopeSchema = z
  .object({
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type SettingsExportEnvelope = z.infer<typeof SettingsExportEnvelopeSchema>;
