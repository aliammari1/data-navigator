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
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
