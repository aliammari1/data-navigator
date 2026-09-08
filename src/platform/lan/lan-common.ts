
/**
 * Shared LAN collaboration utilities (Crypto, Tokens, Host Secret).
 * This file is usable on both Server and Client (no "use client" directive).
 */

export type LANRole = "host" | "editor" | "reviewer" | "viewer";

/**
 * Capabilities the host can grant to a guest independently of role. A reviewer
 * with `uploadData` can upload but not edit; an editor without `exportData`
 * can edit but not export. The set is closed (additive only) — unknown values
 * are rejected at the approve boundary so a tampered JWT can't smuggle
 * permissions the host never granted.
 */
export const GUEST_PERMISSIONS = [
  "viewReports",
  "uploadData",
  "exportData",
  "editComments",
  "useAI",
  "manageUsers",
  "accessSettings",
] as const;

export type GuestPermission = (typeof GUEST_PERMISSIONS)[number];

export function isGuestPermission(value: unknown): value is GuestPermission {
  return (
    typeof value === "string" &&
    (GUEST_PERMISSIONS as readonly string[]).includes(value)
  );
}

export interface InvitePayload {
  iss: "data-navigator";
  sub: string;
  aud: "guest-invite";
  room: string;
  defaultRole: "viewer" | "editor" | "reviewer";
  pairingCode: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface SessionPayload {
  iss: "data-navigator";
  sub: string;
  aud: "guest-session";
  room: string;
  role: "viewer" | "editor" | "reviewer";
  name: string;
  pairingCode: string;
  jti: string;
  iat: number;
  permissions: GuestPermission[];
}

export const INVITE_TTL_MS = 60 * 60 * 1000;

function encodeBytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  return new Uint8Array(Buffer.from(s, "utf8"));
}

function decodeBytes(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString("utf8");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return typeof btoa !== "undefined"
    ? btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (s.length % 4)) % 4;
  s = s + "=".repeat(pad);
  if (typeof atob !== "undefined") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, "base64"));
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(encodeBytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signWithType(
  type: "dn-invite" | "dn-session",
  iss: "data-navigator",
  aud: "guest-invite" | "guest-session",
  payload: object,
  exp: number | null,
  secret: string,
): Promise<string> {
  const fullPayload = {
    iss,
    aud,
    jti: crypto.randomUUID(),
    iat: Date.now(),
    ...(exp !== null ? { exp } : {}),
    ...payload,
  };
  const header = { alg: "HS256", typ: type };
  const headerB64 = bytesToBase64Url(encodeBytes(JSON.stringify(header)));
  const payloadB64 = bytesToBase64Url(encodeBytes(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toBufferSource(encodeBytes(signingInput))),
  );
  return `${signingInput}.${bytesToBase64Url(sig)}`;
}

async function verifyWithType(
  token: string,
  expectedType: "dn-invite" | "dn-session",
  expectedAud: "guest-invite" | "guest-session",
  expectedIss: "data-navigator",
  secret: string,
  expCheck: boolean,
): Promise<object | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const key = await importHmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      toBufferSource(base64UrlToBytes(sigB64)),
      toBufferSource(encodeBytes(`${headerB64}.${payloadB64}`)),
    );
    if (!ok) return null;
    const header = JSON.parse(decodeBytes(base64UrlToBytes(headerB64)));
    if (header.typ !== expectedType || header.alg !== "HS256") return null;
    const payload = JSON.parse(decodeBytes(base64UrlToBytes(payloadB64)));
    if (payload.iss !== expectedIss || payload.aud !== expectedAud) return null;
    if (expCheck && typeof payload.exp === "number" && payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function signInviteToken(
  payload: Omit<InvitePayload, "iss" | "aud" | "jti" | "iat" | "exp">,
  secret: string,
): Promise<string> {
  return signWithType("dn-invite", "data-navigator", "guest-invite", payload, Date.now() + INVITE_TTL_MS, secret);
}

export async function verifyInviteToken(
  token: string,
  secret: string,
): Promise<InvitePayload | null> {
  const payload = await verifyWithType(token, "dn-invite", "guest-invite", "data-navigator", secret, true);
  return payload as InvitePayload | null;
}

export async function signSessionToken(
  payload: Omit<SessionPayload, "iss" | "aud" | "jti" | "iat">,
  secret: string,
): Promise<string> {
  return signWithType("dn-session", "data-navigator", "guest-session", payload, null, secret);
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const payload = await verifyWithType(token, "dn-session", "guest-session", "data-navigator", secret, false);
  return payload as SessionPayload | null;
}

const HOST_SECRET_FALLBACK = "data-navigator-dev-secret-do-not-use-in-prod";
const HOST_SECRET_ENV = "DATA_NAVIGATOR_HOST_SECRET";

function generateRandomSecret(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToBase64Url(bytes);
}

// In-memory process-lifetime cache — zero disk, zero localStorage leakage
let cachedFallbackHostSecret: string | null = null;

function getOrCreateHostSecretSync(): string {
  if (cachedFallbackHostSecret !== null) return cachedFallbackHostSecret;
  if (typeof process !== "undefined" && process.env?.[HOST_SECRET_ENV]) {
    const fromEnv = process.env[HOST_SECRET_ENV];
    if (fromEnv && fromEnv.length >= 32) {
      cachedFallbackHostSecret = fromEnv;
      return cachedFallbackHostSecret;
    }
  }
  try {
    cachedFallbackHostSecret = generateRandomSecret();
    return cachedFallbackHostSecret;
  } catch {
    cachedFallbackHostSecret = HOST_SECRET_FALLBACK;
    return cachedFallbackHostSecret;
  }
}

let cachedElectronSecret: string | null = null;

/**
 * In Electron, we fetch the canonical host secret from the main process
 * once at startup to ensure the renderer and hub are perfectly in sync.
 */
if (typeof window !== "undefined" && (window as any).electronCollab) {
  (window as any).electronCollab.getHostSecret().then((s: string) => {
    cachedElectronSecret = s;
  });
}

export function getHostSecret(): string {
  if (cachedElectronSecret) return cachedElectronSecret;
  return getOrCreateHostSecretSync();
}
