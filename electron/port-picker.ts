import net from "node:net";

/**
 * Default production port range (plage de ports) for Data Navigator.
 * Uses high unprivileged ports outside standard web dev ranges (3000, 5173, 8080).
 */
export const PROD_PORT_RANGE = {
  start: 30100,
  end: 30200,
} as const;

/**
 * Check if a TCP port is currently available on the specified host.
 */
export async function isPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Parse an optional PORT_RANGE env string (e.g. "30100-30200" or "30100..30200").
 */
export function parsePortRange(rangeStr?: string): { start: number; end: number } | null {
  if (!rangeStr) return null;
  const match = rangeStr.trim().match(/^(\d+)[-.]+(\d+)$/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  if (isNaN(start) || isNaN(end) || start <= 0 || end < start || end > 65535) {
    return null;
  }
  return { start, end };
}

/**
 * Find the first available port in a range.
 */
export async function findAvailablePortInRange(
  start: number = PROD_PORT_RANGE.start,
  end: number = PROD_PORT_RANGE.end,
  host = "127.0.0.1",
): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`[port-picker] No available port found in range ${start}-${end} on ${host}`);
}

/**
 * Resolve the runtime port for the application:
 * 1. If explicit PORT env var is given, use it.
 * 2. If running in production (packaged or NODE_ENV === "production"), choose an available port
 *    from the production port range (or PORT_RANGE env var).
 * 3. In dev mode, defaults to 3000.
 */
export async function resolveAppPort(options?: {
  isPackaged?: boolean;
  nodeEnv?: string;
  envPort?: string;
  envPortRange?: string;
  host?: string;
}): Promise<number> {
  const envPort = options?.envPort ?? process.env.PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }

  const isProduction =
    options?.isPackaged ??
    (options?.nodeEnv === "production" ||
      process.env.NODE_ENV === "production" ||
      (typeof process !== "undefined" && process.env.APP_ENV === "production"));

  if (isProduction) {
    const customRange = parsePortRange(options?.envPortRange ?? process.env.PORT_RANGE);
    const start = customRange?.start ?? PROD_PORT_RANGE.start;
    const end = customRange?.end ?? PROD_PORT_RANGE.end;
    return findAvailablePortInRange(start, end, options?.host ?? "127.0.0.1");
  }

  return 3000;
}
