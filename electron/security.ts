import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Electron security primitives — the trust boundary between the (untrusted)
 * renderer and the (privileged) main process.
 *
 * These functions are deliberately pure and free of any `electron` import so
 * they can be unit-tested in a plain Node/jsdom environment. `electron/main.ts`
 * is a thin wiring layer over this module.
 *
 * Threat model:
 *  - The renderer may send arbitrary IPC payloads, including path-traversal
 *    attempts (`../../etc/passwd`) and untrusted origins.
 *  - Filesystem access is denied by default and only granted for paths the user
 *    explicitly selected through a native dialog, or paths inside the app's own
 *    data directory.
 *  - IPC is only honoured from local app origins (file://, localhost, 127.0.0.1).
 */

export function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * True when `childPath` is the same as, or nested inside, `parentPath`.
 * Resolves both paths first so `..` segments cannot escape the parent.
 */
export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = normalizePath(childPath);
  const parent = normalizePath(parentPath);
  const relative = path.relative(parent, child);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Only local application origins are trusted to invoke privileged IPC.
 * Anything else (http(s) to a remote host, data:, about:, malformed) is denied.
 */
export function isAllowedAppOrigin(value?: string): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);

    if (url.protocol === "file:") return true;
    if (url.hostname === "localhost") return true;
    if (url.hostname === "127.0.0.1") return true;

    return false;
  } catch {
    return false;
  }
}

export type MediaPermissionDetails = {
  mediaType?: string;
  mediaTypes?: string[];
  requestingUrl?: string;
  securityOrigin?: string;
};

/** True when a media permission request is (or may be) for the microphone. */
export function wantsMicrophone(details?: MediaPermissionDetails): boolean {
  if (!details) return true;

  if (Array.isArray(details.mediaTypes)) {
    return details.mediaTypes.includes("audio");
  }

  if (details.mediaType) {
    return details.mediaType === "audio" || details.mediaType === "unknown";
  }

  return true;
}

/** Validate that `input` is an object carrying a non-empty string at `key`. */
export function getStringProperty(input: unknown, key: string): string {
  if (!input || typeof input !== "object") {
    throw new Error(`Expected object input with property "${key}".`);
  }

  const value = (input as Record<string, unknown>)[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Expected non-empty string property "${key}".`);
  }

  return value;
}

/**
 * Stateful allowlist controller for filesystem access.
 *
 * A path becomes readable/writable only after the user selected it through a
 * native dialog (which calls `rememberReadPath` / `rememberSavePath` /
 * `rememberDirectory`), or when it lives inside the app data directory.
 * Deletes are restricted to the app data directory regardless of allowlist.
 */
export class PathAccessController {
  readonly #dataDir: string;
  readonly #allowedReadPaths = new Set<string>();
  readonly #allowedWritePaths = new Set<string>();
  readonly #allowedDirectoryPaths = new Set<string>();

  constructor(dataDir: string) {
    this.#dataDir = normalizePath(dataDir);
  }

  get dataDir(): string {
    return this.#dataDir;
  }

  isInsideDataDir(filePath: string): boolean {
    return isPathInside(filePath, this.#dataDir);
  }

  /** Remember a user-selected file/dir for reads (e.g. from an open dialog). */
  rememberReadPath(filePath: string): void {
    const resolved = normalizePath(filePath);
    this.#allowedReadPaths.add(resolved);
    this.#allowedDirectoryPaths.add(resolved);
  }

  /** Remember a user-selected save target for writes (e.g. from a save dialog). */
  rememberSavePath(filePath: string): void {
    this.#allowedWritePaths.add(normalizePath(filePath));
  }

  /** Remember a user-selected directory (open-directory dialog). */
  rememberDirectory(dirPath: string): void {
    this.#allowedDirectoryPaths.add(normalizePath(dirPath));
  }

  assertAllowedReadPath(filePath: string): string {
    const resolved = normalizePath(filePath);

    if (this.#allowedReadPaths.has(resolved) || this.isInsideDataDir(resolved)) {
      return resolved;
    }

    for (const allowedDir of this.#allowedDirectoryPaths) {
      if (isPathInside(resolved, allowedDir)) {
        return resolved;
      }
    }

    throw new Error(`Blocked read access to untrusted path: ${resolved}`);
  }

  assertAllowedWritePath(filePath: string): string {
    const resolved = normalizePath(filePath);

    if (this.#allowedWritePaths.has(resolved) || this.isInsideDataDir(resolved)) {
      return resolved;
    }

    throw new Error(`Blocked write access to untrusted path: ${resolved}`);
  }

  assertAllowedDeletePath(filePath: string): string {
    const resolved = normalizePath(filePath);

    if (!this.isInsideDataDir(resolved)) {
      throw new Error(`Blocked delete access outside app data dir: ${resolved}`);
    }

    return resolved;
  }

  assertAllowedDirectoryPath(dirPath: string): string {
    const resolved = normalizePath(dirPath);

    if (this.#allowedDirectoryPaths.has(resolved) || this.isInsideDataDir(resolved)) {
      return resolved;
    }

    throw new Error(`Blocked directory access to untrusted path: ${resolved}`);
  }
}

// ─── Cross-Origin Isolation headers ──────────────────────────────────────────
//
// SharedArrayBuffer (and therefore WASM threads + the DuckDB-WASM COI bundle for
// any non-Electron web path) is only available in a cross-origin-isolated
// context. That requires COOP:same-origin + COEP:require-corp on *every*
// document response. These are applied unconditionally in `onHeadersReceived`
// (see main.ts) so the renderer is always cross-origin isolated.
//
// Header values are lower-cased deliberately: `onHeadersReceived` overwrites any
// existing casing variant we strip, keeping the response header map canonical.
export const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": ["same-origin"],
  "Cross-Origin-Embedder-Policy": ["require-corp"],
  "Cross-Origin-Resource-Policy": ["same-origin"],
} as const;

/**
 * Merge cross-origin-isolation headers into a response-header map.
 *
 * Pure helper so the wiring in main.ts stays a one-liner and the header policy
 * is unit-testable. Existing COOP/COEP/CORP entries (any casing) are removed
 * first so our policy always wins and is never duplicated.
 */
export function withCrossOriginIsolationHeaders(
  responseHeaders: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> {
  const managed = new Set([
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
  ]);

  const next: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(responseHeaders ?? {})) {
    if (!managed.has(key.toLowerCase())) {
      next[key] = value;
    }
  }

  for (const [key, value] of Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)) {
    next[key] = [...value];
  }

  return next;
}

// ─── Renderer Content-Security-Policy + static security headers ──────────────
//
// The renderer is WASM- and Worker-heavy (DuckDB-WASM, node-llama-cpp results,
// ~35 ESM/blob workers, webgazer/mediapipe) and is cross-origin isolated
// (COOP/COEP/CORP above). The CSP therefore MUST allow `worker-src 'self' blob:`
// and `script-src 'wasm-unsafe-eval'`, or the data engine hard-breaks.
//
// Two CSP headers are emitted (browsers honour both at once):
//  - ENFORCE: blocks the high-value vectors (remote scripts, object/embed, base
//    hijack, external framing, form exfil, non-self/ws network egress) while
//    tolerating the inline scripts/styles Next.js hydration + Tailwind require.
//  - REPORT-ONLY: a stricter nonce-free target (no 'unsafe-inline') so DevTools
//    violations map the path to a future nonce-based enforce policy.

const CSP_CONNECT_SRC = [
  "'self'",
  "blob:",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "ws://localhost:3000",
  "ws://127.0.0.1:3000",
  // LAN collaboration peers are discovered dynamically (any host:port).
  "ws:",
  "wss:",
].join(" ");

function rendererCspDirectives(options: { strict: boolean; dev: boolean }): string {
  const scriptSrc = ["'self'", "'wasm-unsafe-eval'"];
  if (!options.strict) scriptSrc.push("'unsafe-inline'");
  if (options.dev) scriptSrc.push("'unsafe-eval'"); // dev HMR / source maps only
  const styleSrc = options.strict ? ["'self'"] : ["'self'", "'unsafe-inline'"];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `connect-src ${CSP_CONNECT_SRC}`,
    "manifest-src 'self'",
  ].join("; ");
}

/** Build the enforce + report-only renderer CSP strings. Pure + testable. */
export function buildRendererCsp(options: { dev: boolean }): {
  enforce: string;
  reportOnly: string;
} {
  return {
    enforce: rendererCspDirectives({ strict: false, dev: options.dev }),
    reportOnly: rendererCspDirectives({ strict: true, dev: options.dev }),
  };
}

/** Static, always-safe security response headers for the renderer. */
export const STATIC_SECURITY_HEADERS = {
  "X-Content-Type-Options": ["nosniff"],
  "X-Frame-Options": ["SAMEORIGIN"],
  "Referrer-Policy": ["no-referrer"],
  "Permissions-Policy": [
    "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
  ],
  "X-DNS-Prefetch-Control": ["off"],
} as const;

/**
 * Full renderer security-header policy: cross-origin isolation + CSP (enforce +
 * report-only) + static headers. Existing variants (any casing) are stripped so
 * our policy always wins. `enforceCsp:false` ships only the report-only CSP
 * (use during initial rollout while watching DevTools for violations).
 */
export function withRendererSecurityHeaders(
  responseHeaders: Record<string, string | string[]> | undefined,
  options: { dev: boolean; enforceCsp?: boolean },
): Record<string, string | string[]> {
  const next = withCrossOriginIsolationHeaders(responseHeaders);

  const managed = new Set([
    "content-security-policy",
    "content-security-policy-report-only",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "x-dns-prefetch-control",
    "x-powered-by",
  ]);
  for (const key of Object.keys(next)) {
    if (managed.has(key.toLowerCase())) delete next[key];
  }

  const csp = buildRendererCsp({ dev: options.dev });
  if (options.enforceCsp !== false) {
    next["Content-Security-Policy"] = [csp.enforce];
  }
  next["Content-Security-Policy-Report-Only"] = [csp.reportOnly];

  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    next[key] = [...value];
  }

  return next;
}

// ─── Loopback bind enforcement ───────────────────────────────────────────────
//
// "localhost-only" must be an enforced invariant, not a convention: the embedded
// Next server's hostname is derived from BETTER_AUTH_BASE_URL, which is
// env-overridable. If it ever resolves to a non-loopback host the whole web
// threat surface would apply. Fail closed.

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHostname(hostname: string | undefined): boolean {
  if (!hostname) return false;
  return LOOPBACK_HOSTNAMES.has(hostname.trim().toLowerCase());
}

export function assertLoopbackHostname(hostname: string): string {
  if (!isLoopbackHostname(hostname)) {
    throw new Error(
      `Refusing to bind the embedded server to non-loopback host "${hostname}". ` +
        "Data Navigator is localhost-only; set BETTER_AUTH_BASE_URL to a loopback origin.",
    );
  }
  return hostname;
}

// ─── better-auth secret persistence ───────────────────────────────────────────
//
// Shipping a constant `BETTER_AUTH_SECRET` means every install signs sessions
// with the same key — a forgeable-cookie footgun. Instead we derive a random
// 256-bit secret once and persist it inside userData (0600), then expose it via
// `process.env.BETTER_AUTH_SECRET` for `auth.ts` to read.

const SECRET_FILE_NAME = "better-auth-secret";

/**
 * Read the persisted better-auth secret, generating + writing one on first run.
 *
 * Pure-ish (filesystem-only, no `electron` import) so it can be unit-tested with
 * a temp dir. Returns the secret string; callers assign it to the env var.
 */
export function loadOrCreateAuthSecret(userDataDir: string): string {
  const secretPath = path.join(normalizePath(userDataDir), SECRET_FILE_NAME);

  if (existsSync(secretPath)) {
    const existing = readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) {
      return existing;
    }
  }

  const secret = crypto.randomBytes(32).toString("hex");

  mkdirSync(path.dirname(secretPath), { recursive: true });
  writeFileSync(secretPath, secret, { encoding: "utf8", mode: 0o600 });

  return secret;
}

/**
 * Ensure `process.env.BETTER_AUTH_SECRET` is populated from persistent storage.
 * Idempotent: an already-set env var (e.g. an operator override) is respected.
 */
export function ensureAuthSecretEnv(userDataDir: string): string {
  const existing = process.env.BETTER_AUTH_SECRET;
  if (existing && existing.trim().length >= 32) {
    return existing;
  }

  const secret = loadOrCreateAuthSecret(userDataDir);
  process.env.BETTER_AUTH_SECRET = secret;
  return secret;
}

// ─── @electron/fuses production hardening ──────────────────────────────────────
//
// Pure configuration object consumed by the Electron Forge `FusesPlugin` in the
// prod build path (forge.config.ts — cross-cutting, out of this slice's scope).
// Flipping these fuses at package time bakes the hardening into the binary so it
// cannot be re-enabled at runtime via env vars or CLI flags.
//
// String keys (not the FuseV1Options enum) are used so this module stays free of
// an `@electron/fuses` import — keeping it pure and unit-testable. FusesPlugin
// accepts the enum members; forge.config.ts maps these flags onto them.
export const PRODUCTION_FUSE_CONFIG = {
  /** Disallow `ELECTRON_RUN_AS_NODE` — no arbitrary Node execution via the app. */
  RunAsNode: false,
  /** Encrypt cookies at rest (session/auth cookies). */
  EnableCookieEncryption: true,
  /** Ignore `NODE_OPTIONS` — blocks env-var-based code injection. */
  EnableNodeOptionsEnvironmentVariable: false,
  /** Ignore `--inspect`/`--inspect-brk` — blocks debugger attach in prod. */
  EnableNodeCliInspectArguments: false,
  /** Validate the embedded ASAR's integrity header before loading. */
  EnableEmbeddedAsarIntegrityValidation: true,
  /** Only ever load app code from the packaged ASAR (no loose files). */
  OnlyLoadAppFromAsar: true,
  /**
   * Browser-process-specific V8 snapshot, separate from renderers — would shrink
   * the blast radius of a poisoned shared snapshot (the CVE-2025-55305 gadget
   * class). MUST stay false unless the build also GENERATES and ships a
   * `browser_v8_context_snapshot.bin` next to the executable: enabling this fuse
   * makes the browser process load that file, and Electron does not produce it.
   * With the fuse on and the file absent, the browser process dies at startup with
   * `FATAL: Error loading V8 startup snapshot file` — before any app code runs, so
   * the window never appears and nothing is logged (regression from 2026-06-18).
   * A plain copy of `v8_context_snapshot.bin` adds no real protection (the two must
   * actually differ), and generating a distinct snapshot needs mksnapshot tooling
   * matched to this Electron's V8, which the build does not have — so we keep the
   * standard shared snapshot and leave this off.
   */
  LoadBrowserProcessSpecificV8Snapshot: false,
  /**
   * Drop `file://` extra privileges. The UI is served over `http://localhost`,
   * never `file://`, so cross-`file://` fetch / service workers / universal
   * child-frame access are unneeded attack surface. Packaged-build only.
   */
  GrantFileProtocolExtraPrivileges: false,
} as const;

export type ProductionFuseConfig = typeof PRODUCTION_FUSE_CONFIG;
