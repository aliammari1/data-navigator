import { auth, authReady } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  await authReady;
  return handlers.GET(request);
}

export async function POST(request: Request) {
  await authReady;
  return handlers.POST(request);
}
