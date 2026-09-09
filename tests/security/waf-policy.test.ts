import type { IgnoreContext } from "@coraza/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  CRS_RULE_EXCLUSIONS,
  classifyWafBody,
  formatWafBlockDiagnostics,
  TRUSTED_SKIP_BODY_ROUTES,
  type TrustedSkipBodyRoute,
} from "../../src/platform/security/waf-policy";

/**
 * Pure unit tests for the runtime-WAF body policy. The security-critical
 * invariants are:
 *  - the body-skip allowlist is EMPTY, so every request body is inspected (the
 *    settings write route was migrated off HTTP onto Electron IPC);
 *  - credentials (/api/auth) are NEVER body-exempt;
 *  - the CRS protocol exclusions still let the auth POST through.
 */

const BASE = "http://localhost:3000";

const ctx = (method: string, path: string): IgnoreContext => ({
  method,
  url: new URL(path, BASE),
  headers: new Headers(),
  contentLength: null,
});

describe("classifyWafBody — empty allowlist (no body-skip routes)", () => {
  it("no longer skips the body for the retired settings write route", () => {
    // /api/settings was migrated off HTTP onto Electron IPC, so nothing is exempt.
    expect(classifyWafBody(ctx("PUT", "/api/settings/telecom/session"))).toBe(false);
    expect(classifyWafBody(ctx("PUT", "/api/settings/agent-canvas/sql"))).toBe(false);
  });

  it("fully inspects every method on every path", () => {
    expect(classifyWafBody(ctx("PUT", "/api/anything/a/b"))).toBe(false);
    expect(classifyWafBody(ctx("POST", "/api/auth/sign-in"))).toBe(false);
    expect(classifyWafBody(ctx("GET", "/dashboard"))).toBe(false);
  });
});

describe("classifyWafBody — credentials & other routes stay fully inspected", () => {
  it("never skips the body for /api/auth (credentials)", () => {
    expect(classifyWafBody(ctx("POST", "/api/auth/sign-in"))).toBe(false);
    expect(classifyWafBody(ctx("PUT", "/api/auth/anything"))).toBe(false);
  });

  it("does not match the single-segment export read route", () => {
    expect(classifyWafBody(ctx("PUT", "/api/settings/export"))).toBe(false);
    expect(classifyWafBody(ctx("GET", "/api/settings/export"))).toBe(false);
  });

  it("is anchored — does not over-match shorter/deeper paths", () => {
    expect(classifyWafBody(ctx("PUT", "/api/settings"))).toBe(false);
    expect(classifyWafBody(ctx("PUT", "/api/settings/onlyone"))).toBe(false);
    expect(classifyWafBody(ctx("PUT", "/api/settings/a/b/c"))).toBe(false);
  });

  it("fully inspects arbitrary page/API routes", () => {
    expect(classifyWafBody(ctx("PUT", "/dashboard"))).toBe(false);
    expect(classifyWafBody(ctx("POST", "/api/whatever"))).toBe(false);
  });
});

describe("CRS_RULE_EXCLUSIONS — protocol-enforcement false positives", () => {
  it("removes the method allowlist rule (911100) so PUT/DELETE are not blocked", () => {
    expect(CRS_RULE_EXCLUSIONS).toContain("SecRuleRemoveById 911100");
  });

  it("removes the content-type allowlist rule (920420) so application/json is not blocked", () => {
    expect(CRS_RULE_EXCLUSIONS).toContain("SecRuleRemoveById 920420");
  });

  it("does not disable any attack-detection family (no broad removals)", () => {
    // Guard against accidentally widening to a whole range or an attack family.
    expect(CRS_RULE_EXCLUSIONS).not.toMatch(/941|942|930|931|932|934|-\d/);
  });
});

describe("TRUSTED_SKIP_BODY_ROUTES allowlist invariants", () => {
  it("is empty — no route currently skips body inspection", () => {
    expect(TRUSTED_SKIP_BODY_ROUTES).toHaveLength(0);
  });

  it("no entry matches an /api/auth path (credentials must never be exempt)", () => {
    for (const route of TRUSTED_SKIP_BODY_ROUTES) {
      expect(route.pattern.test("/api/auth/sign-in")).toBe(false);
      expect(route.pattern.test("/api/auth/callback/google")).toBe(false);
    }
  });
});

describe("classifyWafBody — route-matching logic, exercised via a temporary route", () => {
  // TRUSTED_SKIP_BODY_ROUTES is intentionally empty in production (see the
  // module doc comment): no test can reach the `if (route.method === method
  // && route.pattern.test(path)) return "skip-body"` loop body through real
  // traffic today. `readonly` on its type is a compile-time-only annotation —
  // the array itself is a plain, un-frozen JS array at runtime — so we push a
  // throwaway route to prove the matching logic itself is correct, then
  // restore the empty invariant afterwards for every other test in the suite.
  const mutableRoutes = TRUSTED_SKIP_BODY_ROUTES as unknown as TrustedSkipBodyRoute[];

  afterEach(() => {
    mutableRoutes.length = 0;
  });

  it("returns 'skip-body' when both the method and the path pattern match a registered route", () => {
    mutableRoutes.push({
      name: "temp-test-route",
      method: "PUT",
      pattern: /^\/api\/test\/skip$/,
      reason: "test-only",
    });
    expect(classifyWafBody(ctx("PUT", "/api/test/skip"))).toBe("skip-body");
  });

  it("does not match when the method differs from the registered route", () => {
    mutableRoutes.push({
      name: "temp-test-route",
      method: "PUT",
      pattern: /^\/api\/test\/skip$/,
      reason: "test-only",
    });
    expect(classifyWafBody(ctx("POST", "/api/test/skip"))).toBe(false);
  });

  it("does not match when the path does not satisfy the registered pattern", () => {
    mutableRoutes.push({
      name: "temp-test-route",
      method: "PUT",
      pattern: /^\/api\/test\/skip$/,
      reason: "test-only",
    });
    expect(classifyWafBody(ctx("PUT", "/api/other"))).toBe(false);
  });

  it("continues past a non-matching route to find a later matching one", () => {
    mutableRoutes.push(
      { name: "r1", method: "GET", pattern: /^\/nope$/, reason: "t" },
      { name: "r2", method: "PUT", pattern: /^\/api\/test\/skip$/, reason: "t" },
    );
    expect(classifyWafBody(ctx("PUT", "/api/test/skip"))).toBe("skip-body");
  });
});

describe("formatWafBlockDiagnostics", () => {
  const base = {
    ruleId: 949110,
    action: "deny",
    status: 403,
    data: "Inbound Anomaly Score Exceeded (Total Score: 15)",
  };

  it("classifies a real CRS hit as source 'crs' and captures request context", () => {
    const d = formatWafBlockDiagnostics(base, {
      method: "PUT",
      url: `${BASE}/api/settings/telecom/session`,
    });
    expect(d).toMatchObject({
      ruleId: 949110,
      status: 403,
      source: "crs",
      method: "PUT",
      path: "/api/settings/telecom/session",
    });
  });

  it("distinguishes an adapter/WAF availability failure as source 'waf-error'", () => {
    const d = formatWafBlockDiagnostics(
      { ...base, ruleId: 0, status: 503, source: "waf-error" },
      { method: "GET", url: `${BASE}/dashboard` },
    );
    expect(d.source).toBe("waf-error");
    expect(d.status).toBe(503);
  });

  it("falls back to the raw url when it is not parseable", () => {
    expect(formatWafBlockDiagnostics(base, { method: "PUT", url: "not a url" }).path).toBe(
      "not a url",
    );
  });
});
