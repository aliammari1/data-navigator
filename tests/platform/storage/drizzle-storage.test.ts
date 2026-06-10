import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDurableSyncForTests,
  createDrizzleStorage,
} from "@/platform/storage/drizzle-storage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Wait for queued microtasks (fire-and-forget writes) to settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createDrizzleStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetDurableSyncForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the localStorage working copy and mirrors it durably once (warm path)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ updatedAt: "2026-01-01" }));
    window.localStorage.setItem("my-store", "warm-value");
    const storage = createDrizzleStorage();

    // value is returned from the synchronous-fast local copy
    await expect(storage.getItem("my-store")).resolves.toBe("warm-value");

    // ...and lifted into drizzle exactly once (covers upgrade-from-localStorage)
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/store/my-store",
      expect.objectContaining({ method: "PUT" }),
    );

    // a second read does NOT re-mirror (dedup)
    await storage.getItem("my-store");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restores from drizzle and repopulates localStorage on a cold cache", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ value: "durable-value" }));
    const storage = createDrizzleStorage();

    await expect(storage.getItem("cold-store")).resolves.toBe("durable-value");
    expect(window.localStorage.getItem("cold-store")).toBe("durable-value");
  });

  it("returns null on a cold cache when drizzle has no row (404)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ value: null }, 404));
    const storage = createDrizzleStorage();

    await expect(storage.getItem("absent")).resolves.toBeNull();
  });

  it("setItem writes localStorage synchronously and PUTs to the namespaced row", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ updatedAt: "2026-01-01" }));
    const storage = createDrizzleStorage({ namespace: "zustand" });

    storage.setItem("data-store", "state-json");

    // synchronous local write
    expect(window.localStorage.getItem("data-store")).toBe("state-json");

    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/zustand/data-store",
      expect.objectContaining({ method: "PUT" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ value: "state-json" });
  });

  it("removeItem clears localStorage and DELETEs the durable row", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    window.localStorage.setItem("doomed", "x");
    const storage = createDrizzleStorage();

    storage.removeItem("doomed");

    expect(window.localStorage.getItem("doomed")).toBeNull();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/store/doomed",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("reports remote write failures through onError without throwing", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    const onError = vi.fn();
    const storage = createDrizzleStorage({ onError });

    expect(() => storage.setItem("s", "v")).not.toThrow();
    // local copy still written despite remote failure
    expect(window.localStorage.getItem("s")).toBe("v");

    await flush();
    expect(onError).toHaveBeenCalledWith("set", "s", expect.any(Error));
  });
});
