import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getHostSecret, verifyInviteToken, verifySessionToken } from "@/platform/lan/lan-common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_COOKIE = "dn_guest_session";
const consumedJtis = new Set<string>();

function markConsumed(jti: string): void {
  consumedJtis.add(jti);
  if (consumedJtis.size > 1024) {
    const oldest = consumedJtis.values().next().value;
    if (oldest) consumedJtis.delete(oldest);
  }
}

function isConsumed(jti: string): boolean {
  return consumedJtis.has(jti);
}

async function isLocalhostRequest(): Promise<boolean> {
  if (typeof process === "undefined") return false;
  const env = process.env;
  if (env && (env.NEXT_PUBLIC_LAN_ALLOW_REMOTE === "1" || env.NODE_ENV !== "production")) {
    return false;
  }
  try {
    const h = await headers();
    const host = h.get("host") ?? h.get("x-forwarded-host") ?? "";
    return /^(localhost|127\.0\.0\.1|\[::1?\])(:\d+)?$/i.test(host);
  } catch {
    return false;
  }
}

async function readInviteTokenFromRequest(): Promise<string | null> {
  try {
    const h = await headers();
    const referer = h.get("referer") ?? "";
    if (referer) {
      try {
        const url = new URL(referer);
        const t = url.searchParams.get("token");
        if (t) return t;
      } catch {}
    }
  } catch {}
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  if (!token) token = await readInviteTokenFromRequest();

  if (!token) {
    return new NextResponse(inviteErrorHtml("Missing invite token."), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const payload = await verifyInviteToken(token, getHostSecret());
  if (!payload) {
    return new NextResponse(inviteErrorHtml("Invite token is invalid or expired."), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (isConsumed(payload.jti)) {
    return new NextResponse(
      inviteErrorHtml("This invite has already been used. Ask the host for a new one."),
      { status: 410, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  return new NextResponse(
    invitePageHtml({
      jti: payload.jti,
      defaultRole: payload.defaultRole,
      pairingCodeHint: "— type the code the host showed you",
      token,
    }),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get("token");
  const name = form.get("name");
  const pairingCode = form.get("pairingCode");

  if (typeof token !== "string" || typeof name !== "string" || typeof pairingCode !== "string") {
    return new NextResponse(inviteErrorHtml("Missing fields."), { status: 400 });
  }

  const trimmedName = name.trim();
  const trimmedCode = pairingCode.trim();
  if (!trimmedName || !trimmedCode) {
    return new NextResponse(inviteErrorHtml("Name and pairing code are required."), {
      status: 400,
    });
  }

  const payload = await verifyInviteToken(token, getHostSecret());
  if (!payload) {
    return new NextResponse(inviteErrorHtml("Invite token is invalid or expired."), {
      status: 401,
    });
  }
  if (payload.pairingCode !== trimmedCode) {
    return new NextResponse(inviteErrorHtml("Pairing code does not match the host."), {
      status: 401,
    });
  }
  if (isConsumed(payload.jti)) {
    return new NextResponse(
      inviteErrorHtml("This invite has already been used. Ask the host for a new one."),
      { status: 410 },
    );
  }

  markConsumed(payload.jti);

  const { createPendingGuest } = await import("@/server/pending-guests");
  const pending = await createPendingGuest({
    name: trimmedName,
    role: payload.defaultRole,
    pairingCode: payload.pairingCode,
    room: payload.room,
    hostSecret: getHostSecret(),
    hostUrl: new URL(request.url).origin,
  });

  return NextResponse.redirect(
    new URL(`/guest/waiting?id=${pending.id}`, new URL(request.url)),
    { status: 303 },
  );
}

export async function clearGuestSession() {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE);
}

export function getGuestSessionFromCookies(): Promise<string | null> {
  return cookies()
    .then((c) => c.get(GUEST_COOKIE)?.value ?? null)
    .catch(() => null);
}

export async function verifyGuestSessionOnServer(
  request: Request,
): Promise<{ ok: true; payload: Awaited<ReturnType<typeof verifySessionToken>> } | { ok: false }> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${GUEST_COOKIE}=([^;]+)`));
  if (!match) return { ok: false };
  const token = decodeURIComponent(match[1]);
  const payload = await verifySessionToken(token, getHostSecret());
  if (!payload) return { ok: false };
  return { ok: true, payload };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inviteErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invitation — data navigator</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 1.5rem; line-height: 1.5; }
  h1 { font-size: 1.1rem; margin: 0 0 .5rem; }
  p { color: #6b7280; margin: 0 0 1rem; }
  .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 999px; font-size: .75rem; font-weight: 600; }
</style>
</head>
<body>
  <span class="badge">Cannot join</span>
  <h1>${escapeHtml(message)}</h1>
  <p>Ask the host to send a new invite link, or try opening the original one again.</p>
</body>
</html>`;
}

function invitePageHtml(props: {
  jti: string;
  defaultRole: string;
  pairingCodeHint: string;
  token: string;
}): string {
  const escapedToken = escapeHtml(props.token);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Join session — data navigator</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 1.5rem; line-height: 1.5; }
  h1 { font-size: 1.2rem; margin: 0 0 .25rem; }
  p { color: #6b7280; margin: 0 0 1.25rem; }
  form { display: flex; flex-direction: column; gap: .75rem; }
  label { font-size: .875rem; font-weight: 600; display: flex; flex-direction: column; gap: .25rem; }
  input { font-size: 1rem; padding: .55rem .7rem; border-radius: .5rem; border: 1px solid #d1d5db; background: white; color: #111827; }
  input:focus { outline: 2px solid #2563eb; outline-offset: 1px; border-color: #2563eb; }
  button { font-size: 1rem; padding: .65rem 1rem; border: 0; border-radius: .5rem; background: #2563eb; color: white; font-weight: 600; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  .meta { color: #6b7280; font-size: .75rem; margin-top: 1rem; }
  .pill { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 999px; font-size: .75rem; font-weight: 600; margin-right: .5rem; }
</style>
</head>
<body>
  <span class="pill">Guest session</span>
  <h1>Join the host's session</h1>
  <p>Enter your name and the pairing code the host showed you.</p>
  <form method="POST" action="/guest/join" autocomplete="off">
    <input type="hidden" name="token" value="${escapedToken}" />
    <label>Your name
      <input name="name" type="text" required maxlength="48" autocomplete="off" placeholder="e.g. Alice" />
    </label>
    <label>Pairing code
      <input name="pairingCode" type="text" required maxlength="32" autocomplete="off" placeholder="6 digits" inputmode="numeric" />
    </label>
    <button type="submit">Join session</button>
  </form>
  <p class="meta">Default role: ${escapeHtml(props.defaultRole)}. The host can change it after you join.</p>
</body>
</html>`;
}

export const __guestCookieName = GUEST_COOKIE;