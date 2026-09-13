import { NextResponse } from "next/server";
import { getHostSecret } from "@/platform/lan/lan-common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { secret: getHostSecret() },
    { headers: { "cache-control": "no-store" } },
  );
}
