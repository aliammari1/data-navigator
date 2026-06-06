import { exportAppSettings } from "@/platform/settings/app-settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const namespace = url.searchParams.get("namespace")?.trim() || undefined;

  return Response.json({
    exportedAt: new Date().toISOString(),
    settings: exportAppSettings(namespace),
  });
}
