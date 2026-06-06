import {
  deleteAppSetting,
  getAppSetting,
  saveAppSetting,
} from "@/platform/settings/app-settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    namespace: string;
    key: string;
  }>;
};

function decodeSegment(value: string): string {
  return decodeURIComponent(value).trim();
}

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const namespace = decodeSegment(params.namespace);
  const key = decodeSegment(params.key);
  const record = getAppSetting(namespace, key);

  if (!record) {
    return Response.json({ value: null }, { status: 404 });
  }

  return Response.json({ value: record.value, updatedAt: record.updatedAt.toISOString() });
}

export async function PUT(request: Request, context: RouteContext) {
  const params = await context.params;
  const namespace = decodeSegment(params.namespace);
  const key = decodeSegment(params.key);
  const body = (await request.json()) as { value?: unknown };

  const record = saveAppSetting(namespace, key, body.value ?? null);

  return Response.json({ value: record.value, updatedAt: record.updatedAt.toISOString() });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  deleteAppSetting(decodeSegment(params.namespace), decodeSegment(params.key));

  return new Response(null, { status: 204 });
}
