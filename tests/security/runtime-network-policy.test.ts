import { describe, expect, it } from "vitest";
import {
  assertOnlineMode,
  shouldAllowRendererRequest,
  shouldOpenExternalUrl,
} from "../../electron/security";

describe("runtime network policy", () => {
  it("blocks network actions while Offline mode is active", () => {
    expect(() => assertOnlineMode("offline", "Model download")).toThrow(/Online mode/);
    expect(() => assertOnlineMode("online", "Model download")).not.toThrow();
  });

  it("opens only HTTPS links in Online mode", () => {
    expect(shouldOpenExternalUrl("https://example.com/path", "online")).toBe(true);
    expect(shouldOpenExternalUrl("https://example.com/path", "offline")).toBe(false);
    expect(shouldOpenExternalUrl("http://example.com", "online")).toBe(false);
    expect(shouldOpenExternalUrl("//example.com", "online")).toBe(false);
  });

  it("keeps Offline renderer requests on the running local server", () => {
    const origin = "http://127.0.0.1:30123";
    expect(shouldAllowRendererRequest(`${origin}/dashboard`, "offline", origin)).toBe(true);
    expect(shouldAllowRendererRequest("http://localhost:30123/api/auth", "offline", origin)).toBe(
      true,
    );
    expect(shouldAllowRendererRequest("https://example.com/data", "offline", origin)).toBe(false);
    expect(shouldAllowRendererRequest("ws://192.168.1.2:1234", "offline", origin)).toBe(false);
    expect(shouldAllowRendererRequest("http://127.0.0.1:30124/", "offline", origin)).toBe(false);
    expect(shouldAllowRendererRequest("file:///etc/passwd", "offline", origin)).toBe(false);
    expect(shouldAllowRendererRequest("blob:local", "offline", origin)).toBe(true);
    expect(shouldAllowRendererRequest("https://example.com/data", "online", origin)).toBe(true);
  });
});
