import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDurableSyncForTests,
  createDrizzleStorage,
} from "@/platform/storage/drizzle-storage";

type Bridge = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
};

/** Install the Electron settings IPC bridge the storage adapter talks to. */
function installBridge(): Bridge {
  const bridge: Bridge = {
    get: vi.fn().mockResolvedValue({ value: null, updatedAt: null }),
    set: vi.fn().mockResolvedValue("2026-01-01"),
    delete: vi.fn().mockResolvedValue(undefined),
    export: vi.fn().mockResolvedValue({}),
  };
  (window as unknown as { electronSettings?: Bridge }).electronSettings = bridge;
  return bridge;
}

function removeBridge(): void {
  (window as unknown as { electronSettings?: Bridge }).electronSettings = undefined;
}

/** Wait for queued microtasks (fire-and-forget writes) to settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createDrizzleStorage", () => {
  let bridge: Bridge;

  beforeEach(() => {
    window.localStorage.clear();
    __resetDurableSyncForTests();
    bridge = installBridge();
  });

  afterEach(() => {
    removeBridge();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the localStorage working copy and mirrors it durably once (warm path)", async () => {
    window.localStorage.setItem("my-store", "warm-value");
    const storage = createDrizzleStorage();

    // value is returned from the synchronous-fast local copy
    await expect(storage.getItem("my-store")).resolves.toBe("warm-value");

    // ...and lifted into the durable store exactly once (upgrade-from-localStorage)
    await flush();
    expect(bridge.set).toHaveBeenCalledTimes(1);
    expect(bridge.set).toHaveBeenCalledWith("store", "my-store", "warm-value");

    // a second read does NOT re-mirror (dedup)
    await storage.getItem("my-store");
    await flush();
    expect(bridge.set).toHaveBeenCalledTimes(1);
  });

  it("restores from the durable store and repopulates localStorage on a cold cache", async () => {
    bridge.get.mockResolvedValueOnce({ value: "durable-value", updatedAt: "2026-01-01" });
    const storage = createDrizzleStorage();

    await expect(storage.getItem("cold-store")).resolves.toBe("durable-value");
    expect(window.localStorage.getItem("cold-store")).toBe("durable-value");
  });

  it("returns null on a cold cache when the durable store has no row", async () => {
    bridge.get.mockResolvedValueOnce({ value: null, updatedAt: null });
    const storage = createDrizzleStorage();

    await expect(storage.getItem("absent")).resolves.toBeNull();
  });

  it("setItem writes localStorage synchronously and upserts the namespaced row", async () => {
    const storage = createDrizzleStorage({ namespace: "zustand" });

    storage.setItem("data-store", "state-json");

    // synchronous local write
    expect(window.localStorage.getItem("data-store")).toBe("state-json");

    await flush();
    expect(bridge.set).toHaveBeenCalledWith("zustand", "data-store", "state-json");
  });

  it("removeItem clears localStorage and deletes the durable row", async () => {
    window.localStorage.setItem("doomed", "x");
    const storage = createDrizzleStorage();

    storage.removeItem("doomed");

    expect(window.localStorage.getItem("doomed")).toBeNull();
    await flush();
    expect(bridge.delete).toHaveBeenCalledWith("store", "doomed");
  });

  it("reports remote write failures through onError without throwing", async () => {
    bridge.set.mockRejectedValue(new Error("ipc down"));
    const onError = vi.fn();
    const storage = createDrizzleStorage({ onError });

    expect(() => storage.setItem("s", "v")).not.toThrow();
    // local copy still written despite remote failure
    expect(window.localStorage.getItem("s")).toBe("v");

    await flush();
    expect(onError).toHaveBeenCalledWith("set", "s", expect.any(Error));
  });

  it("uses the default console.warn onError when none is provided and setItem remote fails", async () => {
    bridge.set.mockRejectedValue(new Error("ipc error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createDrizzleStorage(); // no onError

    storage.setItem("key1", "val1");
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[drizzle-storage] set failed for store/key1"),
      expect.any(Error),
    );
  });

  it("uses the default console.warn onError when none is provided and removeItem remote fails", async () => {
    bridge.delete.mockRejectedValue(new Error("ipc error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createDrizzleStorage(); // no onError

    storage.removeItem("key2");
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[drizzle-storage] remove failed for store/key2"),
      expect.any(Error),
    );
  });

  it("fires onError('set') from the warm-path one-time mirror when the durable write rejects", async () => {
    bridge.set.mockRejectedValue(new Error("mirror-fail"));
    const onError = vi.fn();
    window.localStorage.setItem("warm-key", "warm-value");
    const storage = createDrizzleStorage({ onError });

    await expect(storage.getItem("warm-key")).resolves.toBe("warm-value");
    await flush();

    expect(onError).toHaveBeenCalledWith("set", "warm-key", expect.any(Error));
  });

  it("fires onError('get') from the cold path when the durable read throws", async () => {
    bridge.get.mockRejectedValue(new Error("ipc-fail"));
    const onError = vi.fn();
    // localStorage is empty → cold path
    const storage = createDrizzleStorage({ onError });

    await expect(storage.getItem("cold-fail")).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith("get", "cold-fail", expect.any(Error));
  });

  it("returns null from getItem on cold path when the durable value is not a string", async () => {
    bridge.get.mockResolvedValueOnce({ value: null, updatedAt: null });
    const storage = createDrizzleStorage();

    await expect(storage.getItem("no-string-val")).resolves.toBeNull();
    expect(window.localStorage.getItem("no-string-val")).toBeNull();
  });

  it("readLocal catch: returns null when localStorage.getItem throws", async () => {
    bridge.get.mockResolvedValueOnce({ value: "restored", updatedAt: null });
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const throwingStorage = new Proxy(window.localStorage, {
      get(target, prop) {
        if (prop === "getItem") {
          return () => {
            throw new DOMException("SecurityError: Blocked by content policy");
          };
        }
        return typeof (target as Storage)[prop as keyof Storage] === "function"
          ? (target as Storage)[prop as keyof Storage].bind(target)
          : (target as Storage)[prop as keyof Storage];
      },
    });
    Object.defineProperty(window, "localStorage", {
      value: throwingStorage,
      writable: true,
      configurable: true,
    });
    const storage = createDrizzleStorage();

    // readLocal throws → catch returns null → cold path reads "restored"
    const result = await storage.getItem("throw-key");
    expect(result).toBe("restored");

    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
    }
  });

  it("writeLocal catch: does not throw when localStorage.setItem throws", async () => {
    bridge.get.mockResolvedValueOnce({ value: "remote-val", updatedAt: null });
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const throwingStorage = new Proxy(window.localStorage, {
      get(target, prop) {
        if (prop === "setItem") {
          return () => {
            throw new DOMException("QuotaExceededError");
          };
        }
        return typeof (target as Storage)[prop as keyof Storage] === "function"
          ? (target as Storage)[prop as keyof Storage].bind(target)
          : (target as Storage)[prop as keyof Storage];
      },
    });
    Object.defineProperty(window, "localStorage", {
      value: throwingStorage,
      writable: true,
      configurable: true,
    });
    const storage = createDrizzleStorage();

    await expect(storage.getItem("write-throw")).resolves.toBe("remote-val");

    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
    }
  });

  it("removeLocal catch: does not throw when localStorage.removeItem throws", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const throwingStorage = new Proxy(window.localStorage, {
      get(target, prop) {
        if (prop === "removeItem") {
          return () => {
            throw new DOMException("SecurityError");
          };
        }
        return typeof (target as Storage)[prop as keyof Storage] === "function"
          ? (target as Storage)[prop as keyof Storage].bind(target)
          : (target as Storage)[prop as keyof Storage];
      },
    });
    Object.defineProperty(window, "localStorage", {
      value: throwingStorage,
      writable: true,
      configurable: true,
    });
    const storage = createDrizzleStorage();

    expect(() => storage.removeItem("throw-remove")).not.toThrow();
    await flush();

    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
    }
  });

  it("readLocal/writeLocal/removeLocal return early when localStorage is undefined", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    bridge.get.mockResolvedValue({ value: null, updatedAt: null });
    const storage = createDrizzleStorage();

    // getItem: readLocal returns null (early return) → cold path → null
    await expect(storage.getItem("no-ls-get")).resolves.toBeNull();
    // setItem: writeLocal returns early (no throw)
    expect(() => storage.setItem("no-ls-set", "val")).not.toThrow();
    // removeItem: removeLocal returns early (no throw)
    expect(() => storage.removeItem("no-ls-remove")).not.toThrow();

    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
    }
  });

  it("warm path skips the durable mirror when the bridge is unavailable", async () => {
    window.localStorage.setItem("no-api-key", "cached-val");
    removeBridge();
    const storage = createDrizzleStorage();

    await expect(storage.getItem("no-api-key")).resolves.toBe("cached-val");
  });

  it("getItem returns null on cold path when the bridge is unavailable", async () => {
    removeBridge();
    const storage = createDrizzleStorage();

    await expect(storage.getItem("cold-no-api")).resolves.toBeNull();
  });
});
