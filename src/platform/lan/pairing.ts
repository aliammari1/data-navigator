/**
 * Pairing-code generation for the LAN collaboration UI.
 *
 * Single source of truth shared by every renderer surface that mints a pairing
 * code, replacing three copies of `Math.floor(100000 + Math.random() * 900000)`.
 * `Math.random` is NOT a CSPRNG — a predictable pairing code defeats the access
 * control it is supposed to provide — so this uses the Web Crypto CSPRNG.
 */

const PAIRING_MIN = 100000;
const PAIRING_RANGE = 900000; // 100000..999999 inclusive

/**
 * Generate a cryptographically-random 6-digit pairing code (100000–999999).
 * Uniform (rejection-sampled to remove modulo bias) and isomorphic: works in any
 * context exposing a global Web Crypto `crypto`.
 */
export function generatePairingCode(): string {
  // Largest multiple of PAIRING_RANGE that fits in a uint32, so values >= limit
  // are rejected and the modulo below is unbiased.
  const limit = Math.floor(0xffffffff / PAIRING_RANGE) * PAIRING_RANGE;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return String(PAIRING_MIN + (value % PAIRING_RANGE));
}
