import { NextResponse } from "next/server";
import { listPendingGuests } from "@/server/pending-guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guestList = await listPendingGuests();
  const guests =  guestList.map((g) => ({
    id: g.id,
    name: g.name,
    role: g.role,
    requestedAt: g.requestedAt,
  }));
  return NextResponse.json(
    { guests },
    { headers: { "cache-control": "no-store" } },
  );
}