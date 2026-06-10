import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canUseSettingsApi,
  deleteAppSettingRemote,
  exportAppSettingsRemote,
  getAppSettingRemote,
  putAppSettingRemote,
} from "@/platform/settings/settings-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("settings-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports the API is usable when window + fetch exist", () => {
    expect(canUseSettingsApi()).toBe(true);
  });

  it("getAppSettingRemote returns the value and url-encodes segments", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: { a: 1 }, updatedAt: "2026-01-01" }));

    const result = await getAppSettingRemote("voice", "settings/v3");

    expect(result).toEqual({ value: { a: 1 }, updatedAt: "2026-01-01" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/voice/settings%2Fv3",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("getAppSettingRemote treats 404 as absent (null value, no throw)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ value: null }, 404));

    await expect(getAppSettingRemote("store", "missing")).resolves.toEqual({
      value: null,
      updatedAt: null,
    });
  });

  it("getAppSettingRemote throws on unexpected HTTP errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));

    await expect(getAppSettingRemote("store", "x")).rejects.toThrow("500");
  });

  it("putAppSettingRemote PUTs the wrapped value and returns updatedAt", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: 42, updatedAt: "2026-02-02" }));

    const updatedAt = await putAppSettingRemote("store", "answer", 42);

    expect(updatedAt).toBe("2026-02-02");
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ method: "PUT" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ value: 42 });
  });

  it("deleteAppSettingRemote tolerates 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(deleteAppSettingRemote("store", "gone")).resolves.toBeUndefined();
  });

  it("exportAppSettingsRemote returns the settings map", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ exportedAt: "now", settings: { store: { a: 1 } } }),
    );

    await expect(exportAppSettingsRemote("store")).resolves.toEqual({ store: { a: 1 } });
  });
});
