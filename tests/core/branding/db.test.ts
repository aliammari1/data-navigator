import { describe, expect, it, vi } from "vitest";

const { rows } = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>() }));

vi.mock("dexie", () => ({
  default: class FakeDexie {
    profiles = {
      get: async (id: string) => rows.get(id) ?? undefined,
      put: async (item: Record<string, unknown>) => {
        rows.set(item.id as string, item);
      },
    };

    version(_n: number) {
      return { stores: (_schema: Record<string, string>) => {} };
    }
  },
}));

import { DEFAULT_BRANDING, getActiveBranding, putActiveBranding } from "@/core/branding/db";

describe("branding db", () => {
  it("returns the default profile when nothing is persisted", async () => {
    rows.clear();
    await expect(getActiveBranding()).resolves.toEqual(DEFAULT_BRANDING);
  });

  it("round-trips a persisted profile", async () => {
    rows.clear();
    await putActiveBranding({ ...DEFAULT_BRANDING, companyName: "Acme" });
    await expect(getActiveBranding()).resolves.toMatchObject({ companyName: "Acme" });
  });
});
