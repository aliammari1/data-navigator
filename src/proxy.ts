import { consoleLogger, createWAF } from "@coraza/core";
import { recommended } from "@coraza/coreruleset";
import { type CorazaDecision, createCorazaRunner, defaultBlock } from "@coraza/next";
import { type NextRequest, NextResponse } from "next/server";
import {
  CRS_RULE_EXCLUSIONS,
  classifyWafBody,
  formatWafBlockDiagnostics,
} from "@/platform/security/waf-policy";

// WASM loads once at module init. createWAF returns a Promise<WAF>; the adapter
// accepts the promise (WAFLike) and awaits+caches it on the first request.
// `extra: CRS_RULE_EXCLUSIONS` drops the two protocol-enforcement rules (911100
// method allowlist, 920420 content-type allowlist) that false-positive on this
// JSON REST app — see waf-policy.ts. `logger: consoleLogger` surfaces every
// contributing CRS rule match — the previous config logged only the terminal
// 949110, so a future false positive is diagnosable instead of silent.
const waf = createWAF({
  rules: recommended({ extra: CRS_RULE_EXCLUSIONS }),
  mode: "block",
  logger: consoleLogger,
});

// A WASM/init rejection is NOT covered by `onWAFError` (that only guards
// per-transaction failures) and would otherwise surface as an unhandledRejection
// at module eval. Log it; proxy() also fails closed if the WAF never came up.
waf.catch((error: unknown) => {
  console.error("[waf] initialization failed — requests will fail closed (503)", error);
});

const runCoraza = createCorazaRunner({
  waf,
  // False-positive fix. URL + headers + method + anomaly scoring run on EVERY
  // request; only the request-body phase (CRS 941/942 + other body families) is
  // skipped, and only for the trusted first-party routes in
  // TRUSTED_SKIP_BODY_ROUTES (currently empty). `match` is the
  // ONLY ignore verdict that yields 'skip-body' — `routes`/`methods` yield `true`
  // (a full WAF bypass) and are deliberately unused. A 'skip-body' verdict also
  // makes the runner skip req.arrayBuffer() entirely, sidestepping any Next-16
  // body re-injection risk on that route.
  ignore: { match: classifyWafBody },
  // Log the terminal interruption + request context, distinguishing a real CRS
  // block (source:'crs') from a fail-closed adapter/WAF failure (source:'waf-error').
  onBlock: (interruption, request) => {
    const diagnostics = formatWafBlockDiagnostics(interruption, {
      method: request.method,
      url: request.url,
    });
    const log = diagnostics.source === "waf-error" ? console.error : console.warn;
    log("[waf] request blocked", diagnostics);
    return defaultBlock(interruption, request);
  },
});

const ALLOWED_HOSTS = new Set([
  "localhost:3000",
  "127.0.0.1:3000",
  "localhost",
  "127.0.0.1",
  "[::1]:3000",
  "[::1]",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // 1) Host-header allowlist — defeats DNS-rebinding.
  const host = request.headers.get("host");
  if (!host || !ALLOWED_HOSTS.has(host.toLowerCase())) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  // 2) CSRF — reject cross-site and same-site state-changing requests.
  if (!SAFE_METHODS.has(request.method)) {
    const site = request.headers.get("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") {
      return new NextResponse("Cross-site request blocked", { status: 403 });
    }
  }

  // 3) OWASP CRS via Coraza — SQLi, XSS, LFI, RFI, RCE (inbound phases 1+2).
  //    Response-body rules (RESPONSE-95* data-leakage families) don't fire —
  //    Next 16 proxy.ts has no access to the response body by design.
  //    `onWAFError` only guards per-transaction failures; a WAF construction/await
  //    failure would throw here, so fail closed (503) rather than leaking a 500.
  let decision: CorazaDecision;
  try {
    decision = await runCoraza(request);
  } catch (error) {
    console.error("[waf] runtime error — failing closed (503)", error);
    return new NextResponse("WAF unavailable", { status: 503 });
  }
  if ("blocked" in decision) {
    // Return the blocked response unchanged — post-processing defeats the WAF.
    return decision.blocked as NextResponse;
  }

  // 4) Harden every passing response.
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  // No `runtime` key — Next 16 proxy.ts is Node.js only and rejects the option.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
