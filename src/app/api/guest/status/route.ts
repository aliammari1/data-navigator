import { NextResponse } from "next/server";
import { getPendingGuest } from "@/server/pending-guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ status: "missing-id" }, { status: 400 });
  }

  const guest = await getPendingGuest(id);
  if (!guest) {
    return NextResponse.json(
      { status: "expired" },
      { status: 410, headers: { "cache-control": "no-store" } },
    );
  }
  if (
    guest.clientIp &&
    guest.clientIp !== request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  ) {
    return NextResponse.json({ error: "wrong device" }, { status: 403 });
  }

  if (guest.status === "approved" && guest.sessionToken) {
    return NextResponse.json(
      {
        status: "approved",
        approvedRole: guest.approvedRole,
        name: guest.name,
        sessionToken: guest.sessionToken,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (guest.status === "denied") {
    return NextResponse.json({ status: "denied" }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(
    {
      status: "pending",
      name: guest.name,
      defaultRole: guest.role,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
