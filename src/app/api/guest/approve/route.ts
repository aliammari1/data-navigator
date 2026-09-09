import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GUEST_PERMISSIONS,
  type GuestPermission,
  isGuestPermission,
  signSessionToken,
} from "@/platform/lan/lan-common";
import { approvePendingGuest, getPendingGuest } from "@/server/pending-guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_COOKIE = "dn_guest_session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { id, role, permissions } = body as {
    id?: unknown;
    role?: unknown;
    permissions?: unknown;
  };
  if (typeof id !== "string" || typeof role !== "string") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (role !== "viewer" && role !== "editor" && role !== "reviewer") {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const granted: GuestPermission[] = [];
  if (Array.isArray(permissions)) {
    for (const entry of permissions) {
      if (isGuestPermission(entry)) granted.push(entry);
    }
  }

  const guest = await getPendingGuest(id);
  if (!guest) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (guest.status !== "pending") {
    return NextResponse.json({ error: "already resolved" }, { status: 409 });
  }

  const sessionToken = await signSessionToken(
    {
      sub: `guest-${crypto.randomUUID()}`,
      room: guest.room,
      role,
      name: guest.name,
      pairingCode: guest.pairingCode,
      permissions: granted,
    },
    guest.hostSecret,
  );

  const updated = approvePendingGuest(id, role, sessionToken);
  if (!updated) {
    return NextResponse.json({ error: "could not approve" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      sessionToken,
      role,
      permissions: granted,
      grantedAll: GUEST_PERMISSIONS.length === granted.length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
