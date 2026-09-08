import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPendingGuest } from "@/server/pending-guests";
import { verifySessionToken } from "@/platform/lan/lan-common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_COOKIE = "dn_guest_session";
const ACCEPT_ONE_TIME_HEADER = "dn-accept-once";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { pendingId?: unknown }
    | null;
  if (!body || typeof body.pendingId !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const pending = await getPendingGuest(body.pendingId);
  if (!pending) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
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

  return NextResponse.json(
    { ok: true, name: session.name, role: session.role, room: session.room },
    { headers: { "cache-control": "no-store" } },
  );
}
