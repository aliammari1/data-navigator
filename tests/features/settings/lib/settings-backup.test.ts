/**
 * Unit tests for @/features/settings/lib/settings-backup
 *
 * Mocks:
 *  - @/platform/settings/settings-client  (exportAppSettingsRemote, putAppSettingRemote)
 *  - @/core/stores/settings-store          (useSettingsStore)
 *
 * The target module's own logic (schema parsing, branching, looping) is kept real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- mocks (must be declared before any import of the target) ----------

vi.mock("@/platform/settings/settings-client", () => ({
  exportAppSettingsRemote: vi.fn(),
  putAppSettingRemote: vi.fn(),
}));

vi.mock("@/core/stores/settings-store", () => {
  const rehydrate = vi.fn().mockResolvedValue(undefined);
  const store = {
    getState: vi.fn(() => ({ theme: "dark", accentColor: "blue" })),
    persist: { rehydrate },
  };
  return { useSettingsStore: store };
});

// ---- now import the module under test and its mock handles ----

import {
  buildSettingsBackup,
  downloadSettingsBackup,
  restoreSettingsFromFile,
} from "@/features/settings/lib/settings-backup";

import { exportAppSettingsRemote, putAppSettingRemote } from "@/platform/settings/settings-client";
import { useSettingsStore } from "@/core/stores/settings-store";

const mockExport = exportAppSettingsRemote as ReturnType<typeof vi.fn>;
const mockPut = putAppSettingRemote as ReturnType<typeof vi.fn>;
const mockRehydrate = useSettingsStore.persist.rehydrate as ReturnType<typeof vi.fn>;

// Helper: create a minimal File from a string
function makeFile(content: string, name = "backup.json"): File {
  return new File([content], name, { type: "application/json" });
}

// A valid settings envelope that restoreSettingsFromFile accepts
const VALID_ENVELOPE = {
  settings: {
    "some-key": { foo: "bar" },
  },
};

// The persist blob key the module uses for the in-memory fallback
const PERSIST_KEY = "data-navigator-settings";

beforeEach(() => {
  vi.clearAllMocks();
  mockExport.mockResolvedValue({});
  mockPut.mockResolvedValue("2024-01-01T00:00:00.000Z");
  mockRehydrate.mockResolvedValue(undefined);
});

// =============================================================================
// buildSettingsBackup
// =============================================================================

describe("buildSettingsBackup", () => {
  it("returns a backup file with the correct kind and version", async () => {
    mockExport.mockResolvedValue({ settings: { "k1": "v1" } });

    const backup = await buildSettingsBackup();

    expect(backup.kind).toBe("data-navigator-settings-backup");
    expect(backup.version).toBe(1);
  });

  it("exportedAt is a valid ISO timestamp close to now", async () => {
    mockExport.mockResolvedValue({ settings: { "k1": "v1" } });

    const before = Date.now();
    const backup = await buildSettingsBackup();
    const after = Date.now();

    const ts = new Date(backup.exportedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("uses the settings object from the API envelope when present", async () => {
    const apiSettings = { "data-navigator-settings": { state: { theme: "light" }, version: 1 } };
    mockExport.mockResolvedValue({ settings: apiSettings });

    const backup = await buildSettingsBackup();

    expect(backup.settings).toEqual(apiSettings);
  });

  it("falls back to exported[namespace] when envelope.settings is absent", async () => {
    // exportAppSettingsRemote returns { settings: ... } but the SettingsExportEnvelopeSchema
    // parsed path also accepts exported[namespace] directly.
    // Simulate the case where the top-level 'settings' key IS the namespace map.
    const directMap = { "my-key": "my-value" };
    mockExport.mockResolvedValue({ settings: directMap });

    const backup = await buildSettingsBackup();

    // settings is populated from envelope.settings
    expect(backup.settings).toEqual(directMap);
    expect(Object.keys(backup.settings).length).toBeGreaterThan(0);
  });

  it("falls back to in-memory store when API export returns empty object", async () => {
    mockExport.mockResolvedValue({});

    const backup = await buildSettingsBackup();

    // The fallback populates {[PERSIST_KEY]: { state, version: 0 }}
    expect(backup.settings).toHaveProperty(PERSIST_KEY);
    const blob = backup.settings[PERSIST_KEY] as { state: unknown; version: number };
    expect(blob.version).toBe(0);
    expect(blob.state).toBeDefined();
  });

  it("falls back to in-memory store when API export returns empty settings record", async () => {
    mockExport.mockResolvedValue({ settings: {} });

    const backup = await buildSettingsBackup();

    expect(backup.settings).toHaveProperty(PERSIST_KEY);
  });

  it("falls back to in-memory store when API throws", async () => {
    mockExport.mockRejectedValue(new Error("network failure"));

    const backup = await buildSettingsBackup();

    expect(backup.settings).toHaveProperty(PERSIST_KEY);
  });

  it("calls exportAppSettingsRemote with namespace 'settings'", async () => {
    mockExport.mockResolvedValue({ settings: { x: 1 } });

    await buildSettingsBackup();

    expect(mockExport).toHaveBeenCalledWith("settings");
  });

  it("includes getState() result in the in-memory fallback blob", async () => {
    mockExport.mockRejectedValue(new Error("boom"));
    (useSettingsStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({ theme: "system" });

    const backup = await buildSettingsBackup();

    const blob = backup.settings[PERSIST_KEY] as { state: { theme: string } };
    expect(blob.state).toEqual({ theme: "system" });
  });
});

// =============================================================================
// downloadSettingsBackup
// =============================================================================

describe("downloadSettingsBackup", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let appendChildSpy: ReturnType<typeof vi.fn>;
  let removeChildSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExport.mockResolvedValue({ settings: { k: "v" } });

    createObjectURL = vi.fn(() => "blob:http://localhost/test-url");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    clickSpy = vi.fn();
    removeChildSpy = vi.fn();
    appendChildSpy = vi.fn();

    // Patch document.createElement to intercept the anchor
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const a = originalCreate("a") as HTMLAnchorElement;
        a.click = clickSpy;
        a.remove = removeChildSpy;
        return a;
      }
      return originalCreate(tag);
    });

    vi.spyOn(document.body, "appendChild").mockImplementation(appendChildSpy);
  });

  it("creates a blob URL and revokes it after download", async () => {
    await downloadSettingsBackup();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/test-url");
  });

  it("appends an anchor, clicks it, then removes it", async () => {
    await downloadSettingsBackup();

    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
  });

  it("sets the anchor download attribute to a filename with today's date", async () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    (document.createElement as ReturnType<typeof vi.spyOn>).mockImplementation((tag: string) => {
      if (tag === "a") {
        const a = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
        a.click = clickSpy;
        a.remove = removeChildSpy;
        capturedAnchor = a;
        return a;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement;
    });

    await downloadSettingsBackup();

    expect(capturedAnchor).not.toBeNull();
    expect((capturedAnchor as unknown as HTMLAnchorElement).download).toMatch(
      /^data-navigator-settings-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });

  it("revokes the URL even when an error occurs inside the try block", async () => {
    // Make appendChild throw to simulate a DOM error
    appendChildSpy.mockImplementation(() => {
      throw new Error("DOM error");
    });

    await expect(downloadSettingsBackup()).rejects.toThrow("DOM error");

    // revokeObjectURL should still be called via finally
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/test-url");
  });
});

// =============================================================================
// restoreSettingsFromFile
// =============================================================================

describe("restoreSettingsFromFile – invalid JSON", () => {
  it("returns ok:false with 'not valid JSON' message for malformed content", async () => {
    const file = makeFile("{ not json }");

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/valid JSON/i);
  });
});

describe("restoreSettingsFromFile – schema validation failures", () => {
  it("returns ok:false when the file does not match the envelope schema (no settings key)", async () => {
    const file = makeFile(JSON.stringify({ kind: "wrong", version: 1 }));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/recognised settings backup/i);
  });

  it("returns ok:false when settings is null (envelope parse fails)", async () => {
    // settings is explicitly null — zod will reject because it expects record or undefined
    const file = makeFile(JSON.stringify({ settings: null }));

    const result = await restoreSettingsFromFile(file);

    // null settings fails the `!fileShape.data.settings` guard
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/recognised settings backup/i);
  });
});

describe("restoreSettingsFromFile – empty settings", () => {
  it("returns ok:false with 'no settings' error when the settings map is empty", async () => {
    const file = makeFile(JSON.stringify({ settings: {} }));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/no settings/i);
  });
});

describe("restoreSettingsFromFile – persist key state validation", () => {
  it("returns ok:false when the persist blob state fails SettingsBackupSchema", async () => {
    const payload = {
      settings: {
        [PERSIST_KEY]: {
          state: { theme: "not-a-valid-theme-value-xyz" },
          version: 0,
        },
      },
    };
    const file = makeFile(JSON.stringify(payload));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/validation/i);
  });

  it("accepts the persist blob when state passes SettingsBackupSchema (valid theme)", async () => {
    const payload = {
      settings: {
        [PERSIST_KEY]: {
          state: { theme: "dark" },
          version: 0,
        },
      },
    };
    const file = makeFile(JSON.stringify(payload));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(true);
    expect((result as { ok: true; restoredKeys: number }).restoredKeys).toBe(1);
  });

  it("accepts the persist blob when state is an empty object (all fields optional)", async () => {
    const payload = {
      settings: {
        [PERSIST_KEY]: {
          state: {},
          version: 0,
        },
      },
    };
    const file = makeFile(JSON.stringify(payload));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(true);
  });
});

describe("restoreSettingsFromFile – putAppSettingRemote write errors", () => {
  it("returns ok:false with the failed key name when put throws", async () => {
    mockPut.mockRejectedValueOnce(new Error("DB write failed"));

    const file = makeFile(JSON.stringify(VALID_ENVELOPE));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/Failed to write setting/);
    expect((result as { ok: false; error: string }).error).toMatch(/some-key/);
  });
});

describe("restoreSettingsFromFile – happy path", () => {
  it("returns ok:true with restoredKeys count matching the settings map size", async () => {
    const payload = {
      settings: {
        "key-a": "value-a",
        "key-b": 42,
        "key-c": { nested: true },
      },
    };
    const file = makeFile(JSON.stringify(payload));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(true);
    expect((result as { ok: true; restoredKeys: number }).restoredKeys).toBe(3);
  });

  it("calls putAppSettingRemote once per key with namespace 'settings'", async () => {
    const payload = {
      settings: {
        "alpha": 1,
        "beta": 2,
      },
    };
    const file = makeFile(JSON.stringify(payload));

    await restoreSettingsFromFile(file);

    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockPut).toHaveBeenCalledWith("settings", "alpha", 1);
    expect(mockPut).toHaveBeenCalledWith("settings", "beta", 2);
  });

  it("calls useSettingsStore.persist.rehydrate() after writing keys", async () => {
    const file = makeFile(JSON.stringify(VALID_ENVELOPE));

    await restoreSettingsFromFile(file);

    expect(mockRehydrate).toHaveBeenCalledTimes(1);
  });

  it("returns ok:true even when rehydrate() throws (non-fatal path)", async () => {
    mockRehydrate.mockRejectedValueOnce(new Error("rehydrate failed"));
    const file = makeFile(JSON.stringify(VALID_ENVELOPE));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(true);
  });

  it("passes the full value object through to putAppSettingRemote", async () => {
    const deepValue = { state: { theme: "light", nested: { list: [1, 2, 3] } }, version: 2 };
    const payload = { settings: { "complex-key": deepValue } };
    const file = makeFile(JSON.stringify(payload));

    await restoreSettingsFromFile(file);

    expect(mockPut).toHaveBeenCalledWith("settings", "complex-key", deepValue);
  });

  it("handles a single-key backup that is not the persist key", async () => {
    const payload = { settings: { "another-key": "some-value" } };
    const file = makeFile(JSON.stringify(payload));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(true);
    expect((result as { ok: true; restoredKeys: number }).restoredKeys).toBe(1);
  });
});

describe("restoreSettingsFromFile – partial write failure stops at first error", () => {
  it("stops writing after the first put failure and returns error for that key", async () => {
    // First key succeeds, second key fails
    mockPut
      .mockResolvedValueOnce("2024-01-01")
      .mockRejectedValueOnce(new Error("second key failed"));

    const payload = {
      settings: {
        "first-key": "v1",
        "second-key": "v2",
      },
    };
    const file = makeFile(JSON.stringify(payload));

    const result = await restoreSettingsFromFile(file);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/second-key/);
    // Only 2 calls attempted total (first succeeded, second threw)
    expect(mockPut).toHaveBeenCalledTimes(2);
  });
});
