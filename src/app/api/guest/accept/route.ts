import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySessionToken } from "@/platform/lan/lan-common";
import { getPrimaryLanIp } from "@/server/lan-ip";
import { getPendingGuest } from "@/server/pending-guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_COOKIE = "dn_guest_session";

function buildHocuspocusUrl(hostUrl: string): string {
  const hocuspocusPort = process.env.HOCUSPOCUS_PORT ?? "1234";
  try {
    const parsed = new URL(hostUrl);
    const protocol = parsed.protocol === "https:" || parsed.protocol === "wss:" ? "wss:" : "ws:";
    let hostname = parsed.hostname;
    // Wildcard bind addresses cannot be used by guests. A loopback URL is
    // intentional for a same-PC session and must keep working end to end.
    const isWildcardHost = hostname === "0.0.0.0" || hostname === "::" || hostname === "[::]";

    if (isWildcardHost) {
      const lanIp = getPrimaryLanIp();
      if (lanIp) {
        hostname = lanIp;
      }
    }
    return `${protocol}//${hostname}:${hocuspocusPort}`;
  } catch {
    const lanIp = getPrimaryLanIp();
    const fallbackProtocol =
      hostUrl.startsWith("https") || hostUrl.startsWith("wss") ? "wss:" : "ws:";
    return `${fallbackProtocol}//${lanIp}:${hocuspocusPort}`;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pendingId?: unknown } | null;
  if (!body || typeof body.pendingId !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const pending = await getPendingGuest(body.pendingId);
  if (!pending) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (
    pending.clientIp &&
    pending.clientIp !== request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  ) {
    return NextResponse.json({ error: "wrong device" }, { status: 403 });
  }
  if (pending.status !== "approved" || !pending.sessionToken) {
    return NextResponse.json({ error: "not approved" }, { status: 409 });
  }
  const session = await verifySessionToken(pending.sessionToken, pending.hostSecret);
  if (!session) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const requestUrl = new URL(request.url);
  cookieStore.set({
    name: GUEST_COOKIE,
    value: pending.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    path: "/",
  });

  const wsUrl = buildHocuspocusUrl(pending.hostUrl);

  return NextResponse.json(
    {
      ok: true,
      name: session.name,
      role: session.role,
      room: session.room,
      url: wsUrl,
      pairingCode: pending.pairingCode,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
