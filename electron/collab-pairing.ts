import { randomInt, timingSafeEqual } from "node:crypto";

/**
 * Pure pairing-code logic for the embedded collaboration hub, extracted from the
 * hub service so it can be unit-tested without spinning up Hocuspocus or Electron
 * (Humble Object pattern: the service is a thin IO shell over these functions).
 */

/** Generate a cryptographically-random 6-digit pairing code (100000–999999). */
export function generatePairingCode(): string {
  // randomInt is a CSPRNG with rejection sampling — uniform, unpredictable.
  return String(randomInt(100000, 1000000));
}

/**
 * Constant-time comparison of a client-supplied pairing code against the active
 * one. Returns false for a missing/empty value or a length mismatch, and uses
 * `timingSafeEqual` for equal-length inputs so it never leaks — via response
 * timing — how much of the code matched. Fail-closed: an empty `expected`
 * rejects everything rather than disabling the gate.
 */
export function pairingCodesMatch(expected: string, actual: string | null | undefined): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // keep timing ~constant, then fail closed
    return false;
  }
  return timingSafeEqual(a, b);
}

// ─── Dual-code role derivation ───────────────────────────────────────────────

type CollabSessionRole = "host" | "editor" | "reviewer" | "viewer";

export interface DerivedAccess {
  role: CollabSessionRole;
  readOnly: boolean;
}

/** Clamp an untrusted requested-role string to a known role (default editor). */
function normalizeRequestedRole(requested: string | null | undefined): CollabSessionRole {
  if (requested === "host" || requested === "reviewer" || requested === "viewer") return requested;
  return "editor";
}

/**
 * Server-side role derivation: the ROLE IS DECIDED BY WHICH CODE THE CLIENT
 * PRESENTS, never by the client's claim alone.
 *
 * - The full pairing code grants the requested role (host/editor, or a
 *   voluntarily read-only reviewer/viewer).
 * - The guest code grants ONLY read-only roles: a "reviewer" request is
 *   honored, anything else is clamped to "viewer". Write access can never be
 *   obtained with the guest code, regardless of the claimed role.
 * - Any other code (or none) is rejected with `null`.
 *
 * `readOnly` must be enforced by the transport (Hocuspocus `connectionConfig
 * .readOnly`), so a malicious client that lies about its role still cannot
 * mutate the document.
 */
export function deriveRoleFromCodes(
  codes: { pairingCode: string; guestCode?: string | null },
  presented: string | null | undefined,
  requestedRole: string | null | undefined,
): DerivedAccess | null {
  const requested = normalizeRequestedRole(requestedRole);
  if (pairingCodesMatch(codes.pairingCode, presented)) {
    return { role: requested, readOnly: requested === "viewer" || requested === "reviewer" };
  }
  if (codes.guestCode && pairingCodesMatch(codes.guestCode, presented)) {
    const role: CollabSessionRole = requested === "reviewer" ? "reviewer" : "viewer";
    return { role, readOnly: true };
  }
  return null;
}

/**
 * Parse the Hocuspocus auth token. The client sends a JSON envelope
 * `{code, peerId, peerName, role}` (see `@/platform/lan/lan-collab`); a bare
 * string token is treated as the code alone for forward/backward compat.
 * Never throws on malformed input — auth then fails closed on the empty code.
 */
export function parseCollabToken(token: string | null | undefined): {
  code: string;
  peerId?: string;
  peerName?: string;
  role?: string;
} {
  if (!token) return { code: "" };
  try {
    const parsed = JSON.parse(token) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
      return {
        code: parsed.code,
        peerId: typeof parsed.peerId === "string" ? parsed.peerId : undefined,
        peerName: typeof parsed.peerName === "string" ? parsed.peerName : undefined,
        role: typeof parsed.role === "string" ? parsed.role : undefined,
      };
    }
  } catch {
    // Not JSON — treat the raw token as the code itself.
  }
  return { code: token };
}
