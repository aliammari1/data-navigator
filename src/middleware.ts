import { type NextRequest, NextResponse } from "next/server";

/**
 * Defense-in-depth for the loopback-bound embedded Next server (:3000).
 *
 * The server is reachable by ANY local process or browser tab on the machine,
 * not just the Electron renderer. This middleware adds two host/CSRF guards;
 * it is layered with better-auth (which only protects `/api/auth/*`) and is
 * NEVER the sole authorization layer — real authz stays in route handlers / the
 * data-access layer (cf. CVE-2025-29927: boundary layers are bypassable).
 *
 * NOTE: the Electron main process boots Next via `startServer({ minimalMode })`.
 * Verify this middleware actually executes on that path with:
 *   curl -s -o /dev/null -w "%{http_code}" -H "Host: evil.test" http://127.0.0.1:3000/
 * It must return 403. If it returns 200, middleware is bypassed under minimalMode
 * and the check must move into the custom-server request wrapper instead.
 */

const ALLOWED_HOSTS = new Set([
  "localhost:3000",
  "127.0.0.1:3000",
  "localhost",
  "127.0.0.1",
  "[::1]:3000",
  "[::1]",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(request: NextRequest): NextResponse {
  // 1) Host-header allowlist → defeats DNS-rebinding. A browser tricked into
  //    resolving an attacker domain to 127.0.0.1 still sends the attacker's
  //    domain in the Host header, which is rejected here.
  const host = request.headers.get("host");
  if (!host || !ALLOWED_HOSTS.has(host.toLowerCase())) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  // 2) CSRF → reject cross-site state-changing requests. Browsers set
  //    `Sec-Fetch-Site` and page JS cannot forge it; the renderer's own
  //    requests are `same-origin`. (A same-machine native process can forge any
  //    header, but the realistic remote vector is a browser, which this blocks.)
  if (!SAFE_METHODS.has(request.method)) {
    const site = request.headers.get("sec-fetch-site");
    if (site === "cross-site") {
      return new NextResponse("Cross-site request blocked", { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on pages + API (incl. auth); skip Next internals/static for overhead.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
