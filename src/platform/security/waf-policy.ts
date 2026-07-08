/**
 * WAF (Coraza / OWASP CRS) policy for the in-process runtime WAF in `src/proxy.ts`.
 *
 * The app authenticates via `POST /api/auth/*` with `application/json` bodies.
 * A class of CRS false positive breaks that traffic, and this module centralises
 * the policy that fixes it — kept pure (type-only `@coraza/core` imports, no I/O)
 * so it is unit-testable without booting WASM:
 *
 * 1. PROTOCOL ENFORCEMENT. CRS blocks any request whose `Content-Type` is not in
 *    its allowlist via rule 920420 — and in this CRS build `application/json` is
 *    not allowed — and any method outside its default allowlist
 *    (`GET HEAD POST OPTIONS`) via rule 911100. Each scores +5, which alone
 *    crosses the inbound anomaly threshold of 5 -> rule 949110 -> 403, so EVERY
 *    auth POST (all `application/json`) was blocked regardless of payload.
 *    Next.js routing already rejects undefined methods (405) and non-JSON bodies
 *    (parse errors), so these two policy rules are redundant here; we remove them
 *    (see {@link CRS_RULE_EXCLUSIONS}).
 *
 * 2. BODY CONTENT. No route currently skips body inspection: every request —
 *    especially the credential-bearing `/api/auth/*` POST — keeps FULL body
 *    inspection, so real SQLi/XSS is caught. The {@link TRUSTED_SKIP_BODY_ROUTES}
 *    mechanism (via {@link classifyWafBody}) is retained for a future first-party
 *    write route, but the allowlist is currently empty.
 */

import type { IgnoreContext, IgnoreVerdict, Interruption } from "@coraza/core";

/**
 * SecLang appended after the CRS includes (via `recommended({ extra })`) to drop
 * the two protocol-enforcement rules that false-positive on this JSON REST app:
 *   - 911100  "Method is not allowed by policy"        (blocks PUT/DELETE)
 *   - 920420  "Request content type is not allowed..." (blocks application/json)
 *
 * `SecRuleRemoveById` is a config-time directive, so appending it after the
 * includes reliably removes the rules (unlike a `setvar` policy override, which
 * runs too late in phase 1 to be read by the enforcement rules). The attack
 * families (941 XSS, 942 SQLi, 930-934 LFI/RFI/RCE, etc.) are untouched and keep
 * inspecting every request body that is not explicitly skip-listed below.
 */
export const CRS_RULE_EXCLUSIONS = ["SecRuleRemoveById 911100", "SecRuleRemoveById 920420"].join(
  "\n",
);

/** Distinguishes a real CRS rule hit from a fail-closed adapter/WASM failure. */
export type WafBlockSource = "crs" | "waf-error";

/** One trusted internal route whose request BODY is exempt from CRS body rules. */
export type TrustedSkipBodyRoute = {
  /** Stable name for logs, audits, and tests. */
  readonly name: string;
  /** HTTP method the exemption applies to; every other method stays fully inspected. */
  readonly method: string;
  /** Anchored pathname matcher. */
  readonly pattern: RegExp;
  /** Security rationale — why dropping body inspection here is acceptable. */
  readonly reason: string;
};

/**
 * Named allowlist of trusted, first-party write routes for which Coraza inspects
 * URL + headers + method + anomaly score but SKIPS the request-body phase. This
 * is the ONLY place body inspection is relaxed. Adding a route here is a reviewed
 * security decision — NEVER add `/api/auth` (credentials).
 *
 * Future Next.js server actions (none exist today) POST rich RSC payloads to
 * PAGE routes with a `Next-Action` header and would false-positive identically;
 * if one is added, add a single entry here gated on that header + path rather
 * than widening this route pattern.
 */
export const TRUSTED_SKIP_BODY_ROUTES: readonly TrustedSkipBodyRoute[] = [];

/**
 * Coraza `ignore.match` predicate. Returns `'skip-body'` for a trusted internal
 * write route, otherwise `false` (inspect everything — the default).
 *
 * IMPORTANT: `'skip-body'` is only reachable via `match` (or `bodyLargerThan`).
 * The declarative `routes`/`methods`/`headerEquals` fields yield `true`, which is
 * a FULL WAF bypass (URL + headers no longer inspected) — never use those to skip
 * a body. This function is sync and side-effect free; the adapter treats a throw
 * as `false` (fail-closed: inspect), so a bug here can never become a bypass.
 */
export function classifyWafBody(ctx: IgnoreContext): IgnoreVerdict {
  const method = ctx.method.toUpperCase();
  const path = ctx.url.pathname;
  for (const route of TRUSTED_SKIP_BODY_ROUTES) {
    if (route.method === method && route.pattern.test(path)) {
      return "skip-body";
    }
  }
  return false;
}

/** Structured diagnostics for a blocked request — logged on every block. */
export type WafBlockDiagnostics = {
  readonly ruleId: number;
  readonly status: number;
  readonly action: string;
  /** CRS reason string, when the build provides one. */
  readonly data: string;
  /** "waf-error" = adapter/WASM availability failure; "crs" = real rule hit. */
  readonly source: WafBlockSource;
  readonly method: string;
  readonly path: string;
};

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Build the structured record logged when Coraza blocks a request. Pure, so it
 * is unit-testable without booting the WAF. Captures the terminal interruption
 * (e.g. 949110) plus the request context the previous config omitted — it logged
 * only the rule id, never the method/path.
 */
export function formatWafBlockDiagnostics(
  interruption: Interruption,
  request: { readonly method: string; readonly url: string },
): WafBlockDiagnostics {
  return {
    ruleId: interruption.ruleId,
    status: interruption.status,
    action: interruption.action,
    data: interruption.data,
    source: interruption.source === "waf-error" ? "waf-error" : "crs",
    method: request.method,
    path: safePath(request.url),
  };
}
