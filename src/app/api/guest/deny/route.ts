import { NextResponse } from "next/server";
import { denyPendingGuest } from "@/server/pending-guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { id } = body as { id?: unknown };
  if (typeof id !== "string") {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const updated = denyPendingGuest(id);
  if (!updated) {
    return NextResponse.json({ error: "not found or resolved" }, { status: 410 });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
