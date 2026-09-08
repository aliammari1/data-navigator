import { NextResponse } from "next/server";
import { authDb } from "@/platform/auth/auth-database";
import * as schema from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = authDb.select().from(schema.user).limit(1).get();
    if (!user) {
      return NextResponse.json({ exists: false }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(
      {
        exists: true,
        email: user.email,
        name: user.name,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { exists: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
