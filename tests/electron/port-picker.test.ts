import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  findAvailablePortInRange,
  isPortAvailable,
  PROD_PORT_RANGE,
  parsePortRange,
  resolveAppPort,
} from "../../electron/port-picker";

describe("port-picker", () => {
  it("parsePortRange parses valid ranges", () => {
    expect(parsePortRange("30100-30200")).toEqual({ start: 30100, end: 30200 });
    expect(parsePortRange("30100..30200")).toEqual({ start: 30100, end: 30200 });
    expect(parsePortRange("4000-5000")).toEqual({ start: 4000, end: 5000 });
  });

  it("parsePortRange returns null for invalid formats", () => {
    expect(parsePortRange(undefined)).toBeNull();
    expect(parsePortRange("")).toBeNull();
    expect(parsePortRange("invalid")).toBeNull();
    expect(parsePortRange("5000-4000")).toBeNull(); // end < start
    expect(parsePortRange("0-1000")).toBeNull(); // start <= 0
    expect(parsePortRange("60000-70000")).toBeNull(); // port > 65535
  });

  it("isPortAvailable returns true for a free port", async () => {
    const freePort = await findAvailablePortInRange(30150, 30160);
    expect(await isPortAvailable(freePort)).toBe(true);
  });

  it("isPortAvailable returns false for an occupied port", async () => {
    const freePort = await findAvailablePortInRange(30160, 30170);
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(freePort, "127.0.0.1", () => resolve());
    });

    try {
      expect(await isPortAvailable(freePort)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    expect(await isPortAvailable(freePort)).toBe(true);
  });

  it("resolveAppPort uses PORT env var when present", async () => {
    const port = await resolveAppPort({ envPort: "4567" });
    expect(port).toBe(4567);
  });

  it("resolveAppPort defaults to 3000 in dev mode", async () => {
    const port = await resolveAppPort({ isPackaged: false, nodeEnv: "development" });
    expect(port).toBe(3000);
  });

  it("resolveAppPort selects an available port from range in production", async () => {
    // Hermetic: an ambient PORT takes precedence by design (explicit request
    // wins) and would mask the range branch under test. (vitest config sets
    // unstubEnvs, so the stub is restored automatically.)
    vi.stubEnv("PORT", "");
    const port = await resolveAppPort({
      isPackaged: true,
      envPortRange: "30180-30190",
    });
    expect(port).toBeGreaterThanOrEqual(30180);
    expect(port).toBeLessThanOrEqual(30190);
  });
});
