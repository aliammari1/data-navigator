/**
 * Session-expiry arithmetic shared by both sides of the Electron trust
 * boundary (main-process `electron/auth-store.ts` and renderer
 * `platform/auth/auth-ipc-client.ts`).
 *
 * In Data Navigator's security model, every session lives strictly until
 * 00h00 of the user's local day, after which the admin is locked out and must
 * relogin. Both sides must agree on the exact instant — hence a single
 * implementation rather than two copies.
 */

/** Calculate the next midnight (00:00:00.000) in the user's local timezone. */
export function getNextLocalMidnight(fromDate: Date = new Date()): Date {
  const next = new Date(fromDate);
  next.setHours(24, 0, 0, 0);
  return next;
}
