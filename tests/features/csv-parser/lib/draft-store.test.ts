import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ColConfig } from "@/features/csv-parser/lib/types";

// ─── Mock @/platform/storage before importing the target module ───────────────
// isOpfsAvailable is the external capability gate. We control it per-test.
vi.mock("@/platform/storage", () => ({
  isOpfsAvailable: vi.fn(() => true),
}));

// Import the mock so we can flip it in individual tests.
import { isOpfsAvailable } from "@/platform/storage";

// ─── OPFS / navigator.storage mock infrastructure ────────────────────────────

// We build a minimal in-memory "file system" backed by a Map so that
// tests can round-trip through saveDraft / loadDraft / clearDraft without
// touching any real browser API.

type WritableStreamMock = {
  write: (blob: Blob) => Promise<void>;
  close: () => Promise<void>;
  _content: string;
};

type FileHandleMock = {
  createWritable: () => Promise<WritableStreamMock>;
  getFile: () => Promise<{ text: () => Promise<string> }>;
  _writtenContent: string | null;
};

/** Factory that creates a fresh navigator.storage mock backed by `store`. */
function buildStorageMock(store: Map<string, string>) {
  return {
    getDirectory: vi.fn(async () => ({
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!store.has(name) && !opts?.create) {
          throw new DOMException("File not found", "NotFoundError");
        }
        const handle: FileHandleMock = {
          _writtenContent: store.get(name) ?? null,
          createWritable: vi.fn(async () => {
            let buffer = "";
            const writable: WritableStreamMock = {
              _content: "",
              write: vi.fn(async (blob: Blob) => {
                buffer += await blob.text();
              }),
              close: vi.fn(async () => {
                store.set(name, buffer);
              }),
            };
            return writable;
          }),
          getFile: vi.fn(async () => ({
            text: vi.fn(async () => store.get(name) ?? ""),
          })),
        };
        return handle;
      }),
      removeEntry: vi.fn(async (name: string) => {
        if (!store.has(name)) {
          throw new DOMException("File not found", "NotFoundError");
        }
        store.delete(name);
      }),
    })),
  };
}

// Helpers ─────────────────────────────────────────────────────────────────────

function makeColConfig(overrides: Partial<ColConfig> = {}): ColConfig {
  return {
    original: "col",
    alias: "col",
    type: "string",
    include: true,
    ...overrides,
  };
}

const BASE_DRAFT = {
  rawText: "a,b\n1,2",
  delimiter: ",",
  hasHeader: true,
  skipEmpty: false,
  trimWS: true,
  colConfigs: [makeColConfig()],
  datasetName: "test.csv",
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("saveDraft / loadDraft / clearDraft", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new Map();
    // Re-enable OPFS by default.
    vi.mocked(isOpfsAvailable).mockReturnValue(true);
    // Install a fresh storage mock.
    Object.defineProperty(global.navigator, "storage", {
      value: buildStorageMock(store),
      writable: true,
      configurable: true,
    });
  });

  // ─── saveDraft ──────────────────────────────────────────────────────────────

  describe("saveDraft", () => {
    it("persists a valid draft to OPFS and the stored JSON is parseable", async () => {
      // Arrange / Act
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);

      // Assert — the in-memory store must contain a JSON blob.
      expect(store.size).toBe(1);
      const raw = store.get("csv-parser-draft.json");
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.rawText).toBe("a,b\n1,2");
      expect(parsed.delimiter).toBe(",");
      expect(parsed.hasHeader).toBe(true);
      expect(parsed.version).toBe(1);
      expect(typeof parsed.savedAt).toBe("number");
    });

    it("stamps the correct version (DRAFT_VERSION = 1) onto every save", async () => {
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);

      const parsed = JSON.parse(store.get("csv-parser-draft.json")!);
      expect(parsed.version).toBe(1);
    });

    it("sets savedAt to a recent epoch timestamp", async () => {
      const before = Date.now();
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);
      const after = Date.now();

      const parsed = JSON.parse(store.get("csv-parser-draft.json")!);
      expect(parsed.savedAt).toBeGreaterThanOrEqual(before);
      expect(parsed.savedAt).toBeLessThanOrEqual(after);
    });

    it("persists colConfigs array in the stored JSON", async () => {
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      const configs = [makeColConfig({ alias: "col_a", type: "number" })];
      await saveDraft({ ...BASE_DRAFT, colConfigs: configs });

      const parsed = JSON.parse(store.get("csv-parser-draft.json")!);
      expect(parsed.colConfigs).toHaveLength(1);
      expect(parsed.colConfigs[0].alias).toBe("col_a");
      expect(parsed.colConfigs[0].type).toBe("number");
    });

    it("persists datasetName in the stored JSON", async () => {
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft({ ...BASE_DRAFT, datasetName: "my-file.csv" });

      const parsed = JSON.parse(store.get("csv-parser-draft.json")!);
      expect(parsed.datasetName).toBe("my-file.csv");
    });

    it("does nothing when OPFS is unavailable", async () => {
      // Arrange: disable OPFS
      vi.mocked(isOpfsAvailable).mockReturnValue(false);

      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);

      // Assert: nothing was written
      expect(store.size).toBe(0);
    });

    it("does nothing when rawText exceeds 4 MB (best-effort guard)", async () => {
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      // 4 * 1024 * 1024 + 1 bytes → should be skipped
      const bigText = "x".repeat(4 * 1024 * 1024 + 1);
      await saveDraft({ ...BASE_DRAFT, rawText: bigText });

      expect(store.size).toBe(0);
    });

    it("allows rawText that is exactly 4 MB (boundary is exclusive)", async () => {
      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      // Exactly 4 MiB — should be persisted.
      const exactText = "x".repeat(4 * 1024 * 1024);
      await saveDraft({ ...BASE_DRAFT, rawText: exactText });

      expect(store.size).toBe(1);
    });

    it("swallows errors from OPFS gracefully (does not throw)", async () => {
      // Arrange: make getDirectory throw.
      Object.defineProperty(global.navigator, "storage", {
        value: {
          getDirectory: vi.fn(async () => {
            throw new Error("OPFS quota exceeded");
          }),
        },
        writable: true,
        configurable: true,
      });

      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      // Act / Assert: must not throw
      await expect(saveDraft(BASE_DRAFT)).resolves.toBeUndefined();
    });

    it("does nothing when navigator.storage.getDirectory is not a function", async () => {
      // Arrange: remove getDirectory to simulate missing API.
      vi.mocked(isOpfsAvailable).mockReturnValue(false);

      const { saveDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);

      expect(store.size).toBe(0);
    });
  });

  // ─── loadDraft ──────────────────────────────────────────────────────────────

  describe("loadDraft", () => {
    it("returns null when OPFS is unavailable", async () => {
      vi.mocked(isOpfsAvailable).mockReturnValue(false);

      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });

    it("returns null when no draft file exists", async () => {
      // store is empty → getFileHandle will throw NotFoundError
      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });

    it("returns a valid CsvDraft when a correct draft exists", async () => {
      // Arrange: pre-populate the store with a valid draft.
      const { saveDraft, loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);

      // Act
      const result = await loadDraft();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.rawText).toBe("a,b\n1,2");
      expect(result!.version).toBe(1);
      expect(result!.delimiter).toBe(",");
      expect(result!.hasHeader).toBe(true);
      expect(result!.skipEmpty).toBe(false);
      expect(result!.trimWS).toBe(true);
      expect(result!.datasetName).toBe("test.csv");
    });

    it("returns null when the stored JSON has the wrong version", async () => {
      // Arrange: write a draft with version 2 (wrong).
      const badPayload = JSON.stringify({ ...BASE_DRAFT, version: 2, savedAt: Date.now() });
      store.set("csv-parser-draft.json", badPayload);

      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });

    it("returns null when rawText is missing (not a string)", async () => {
      // Arrange: write a draft where rawText is a number.
      const badPayload = JSON.stringify({ version: 1, rawText: 42, savedAt: Date.now() });
      store.set("csv-parser-draft.json", badPayload);

      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });

    it("returns null when the stored JSON is corrupt (invalid JSON)", async () => {
      // Arrange: store malformed JSON
      store.set("csv-parser-draft.json", "{ not valid json }}}");

      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });

    it("returns null when the parsed object has no version field", async () => {
      // Arrange: version is undefined.
      const noVersion = JSON.stringify({ rawText: "a,b", savedAt: Date.now() });
      store.set("csv-parser-draft.json", noVersion);

      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });

    it("round-trips colConfigs faithfully", async () => {
      const configs: ColConfig[] = [
        makeColConfig({ original: "id", alias: "ID", type: "number", include: true }),
        makeColConfig({ original: "name", alias: "Name", type: "string", include: false }),
      ];
      const { saveDraft, loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft({ ...BASE_DRAFT, colConfigs: configs });
      const result = await loadDraft();

      expect(result!.colConfigs).toHaveLength(2);
      expect(result!.colConfigs[0].alias).toBe("ID");
      expect(result!.colConfigs[1].include).toBe(false);
    });

    it("returns null when OPFS getDirectory throws", async () => {
      Object.defineProperty(global.navigator, "storage", {
        value: {
          getDirectory: vi.fn(async () => {
            throw new Error("storage error");
          }),
        },
        writable: true,
        configurable: true,
      });

      const { loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      const result = await loadDraft();

      expect(result).toBeNull();
    });
  });

  // ─── clearDraft ─────────────────────────────────────────────────────────────

  describe("clearDraft", () => {
    it("removes the draft file from OPFS", async () => {
      // Arrange: put something in the store first.
      const { saveDraft, clearDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft(BASE_DRAFT);
      expect(store.size).toBe(1);

      // Act
      await clearDraft();

      // Assert
      expect(store.size).toBe(0);
    });

    it("does nothing when OPFS is unavailable", async () => {
      vi.mocked(isOpfsAvailable).mockReturnValue(false);

      // Pre-populate (direct map) so we know it is NOT cleared.
      store.set("csv-parser-draft.json", "{}");

      const { clearDraft } = await import("@/features/csv-parser/lib/draft-store");
      await clearDraft();

      // The file should still be there because we returned early.
      expect(store.size).toBe(1);
    });

    it("does not throw when there is no draft to clear", async () => {
      // store is empty → removeEntry will throw DOMException — must be swallowed.
      const { clearDraft } = await import("@/features/csv-parser/lib/draft-store");
      await expect(clearDraft()).resolves.toBeUndefined();
    });

    it("does not throw when OPFS getDirectory throws", async () => {
      Object.defineProperty(global.navigator, "storage", {
        value: {
          getDirectory: vi.fn(async () => {
            throw new Error("storage error");
          }),
        },
        writable: true,
        configurable: true,
      });

      const { clearDraft } = await import("@/features/csv-parser/lib/draft-store");
      await expect(clearDraft()).resolves.toBeUndefined();
    });

    it("allows loadDraft to return null after clearDraft", async () => {
      // Arrange: save then clear.
      const { saveDraft, loadDraft, clearDraft } = await import(
        "@/features/csv-parser/lib/draft-store"
      );
      await saveDraft(BASE_DRAFT);
      await clearDraft();

      // Act
      const result = await loadDraft();

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─── CsvDraft interface shape ────────────────────────────────────────────────

  describe("CsvDraft interface shape", () => {
    it("round-trips all boolean flags (hasHeader, skipEmpty, trimWS)", async () => {
      const { saveDraft, loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft({ ...BASE_DRAFT, hasHeader: false, skipEmpty: true, trimWS: false });
      const result = await loadDraft();

      expect(result!.hasHeader).toBe(false);
      expect(result!.skipEmpty).toBe(true);
      expect(result!.trimWS).toBe(false);
    });

    it("round-trips various delimiter characters", async () => {
      const { saveDraft, loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft({ ...BASE_DRAFT, delimiter: "\t" });
      const result = await loadDraft();

      expect(result!.delimiter).toBe("\t");
    });

    it("round-trips an empty colConfigs array", async () => {
      const { saveDraft, loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft({ ...BASE_DRAFT, colConfigs: [] });
      const result = await loadDraft();

      expect(result!.colConfigs).toEqual([]);
    });

    it("round-trips an empty rawText string", async () => {
      const { saveDraft, loadDraft } = await import("@/features/csv-parser/lib/draft-store");
      await saveDraft({ ...BASE_DRAFT, rawText: "" });
      const result = await loadDraft();

      // rawText is "" which is typeof "string" → should load fine.
      expect(result).not.toBeNull();
      expect(result!.rawText).toBe("");
    });
  });
});
