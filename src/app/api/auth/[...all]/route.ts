import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/platform/auth/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  return handlers.GET(request);
}

export async function POST(request: Request) {
  return handlers.POST(request);
}
