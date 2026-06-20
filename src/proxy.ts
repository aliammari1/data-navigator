import { createWAF } from "@coraza/core";
import { recommended } from "@coraza/coreruleset";
import { createCorazaRunner } from "@coraza/next";
import { type NextRequest, NextResponse } from "next/server";

// WASM loads once at module init — createWAF is synchronous.
const waf = createWAF({ rules: recommended(), mode: "block" });
const runCoraza = createCorazaRunner({ waf });

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
  const decision = await runCoraza(request);
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
