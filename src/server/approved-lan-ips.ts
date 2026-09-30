import fs from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import path from "node:path";

function approvalFile(): string {
  return path.join(
    process.env.APP_USER_DATA ?? path.join(process.cwd(), ".data"),
    "lan-approved-ips.json",
  );
}

function readApproved(): Set<string> {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(approvalFile(), "utf8"));
    return new Set(
      Array.isArray(value) ? value.filter((ip): ip is string => typeof ip === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function normalizePeerIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const ip = value.startsWith("::ffff:") ? value.slice(7) : value;
  return isIP(ip) === 4 ? ip : null;
}

export function approveLanIp(value: string | null | undefined): void {
  const ip = normalizePeerIp(value);
  if (!ip) return;
  const approved = readApproved();
  approved.add(ip);
  fs.mkdirSync(path.dirname(approvalFile()), { recursive: true });
  fs.writeFileSync(approvalFile(), JSON.stringify([...approved]), { mode: 0o600 });
}

function isApprovedLanIp(value: string | null | undefined): boolean {
  const ip = normalizePeerIp(value);
  return ip !== null && readApproved().has(ip);
}

export function clearApprovedLanIps(): void {
  try {
    fs.unlinkSync(approvalFile());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function mayRequestLanPath(value: string | null | undefined, path: string): boolean {
  const pathname = path.split("?", 1)[0];
  if (
    pathname === "/api/guest/approve" ||
    pathname === "/api/guest/deny" ||
    pathname === "/api/guest/pending"
  )
    return false;
  if (isApprovedLanIp(value)) return true;
  return (
    pathname === "/guest/join" ||
    pathname === "/guest/waiting" ||
    pathname === "/api/guest/status" ||
    pathname === "/api/guest/accept" ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/_next/image" ||
    pathname === "/icon.png"
  );
}

export function lanProxyHeaders(
  incoming: IncomingHttpHeaders,
  peerIp: string | undefined,
  listenerIp: string,
  port: number,
): IncomingHttpHeaders {
  const headers = { ...incoming };
  delete headers.forwarded;
  return {
    ...headers,
    host: `127.0.0.1:${port}`,
    "x-forwarded-for": normalizePeerIp(peerIp) ?? "",
    "x-forwarded-host": `${listenerIp}:${port}`,
    "x-forwarded-proto": "http",
    "x-forwarded-port": String(port),
    "x-real-ip": normalizePeerIp(peerIp) ?? "",
  };
}
