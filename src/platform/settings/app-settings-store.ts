import { and, eq } from "drizzle-orm";
import { appSetting } from "@/db/schema";
import { authDb } from "@/platform/auth/auth-database";

export type AppSettingRecord = {
  namespace: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function getAppSetting(namespace: string, key: string): AppSettingRecord | null {
  return (
    authDb
      .select()
      .from(appSetting)
      .where(and(eq(appSetting.namespace, namespace), eq(appSetting.key, key)))
      .get() ?? null
  );
}

export function listAppSettings(namespace?: string): AppSettingRecord[] {
  const query = authDb.select().from(appSetting);

  if (!namespace) {
    return query.all();
  }

  return query.where(eq(appSetting.namespace, namespace)).all();
}

export function saveAppSetting(namespace: string, key: string, value: unknown): AppSettingRecord {
  const now = new Date();

  authDb
    .insert(appSetting)
    .values({
      namespace,
      key,
      value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [appSetting.namespace, appSetting.key],
      set: {
        value,
        updatedAt: now,
      },
    })
    .run();

  const record = getAppSetting(namespace, key);

  if (!record) {
    throw new Error(`Failed to persist app setting: ${namespace}/${key}`);
  }

  return record;
}

export function deleteAppSetting(namespace: string, key: string): void {
  authDb
    .delete(appSetting)
    .where(and(eq(appSetting.namespace, namespace), eq(appSetting.key, key)))
    .run();
}

export function exportAppSettings(namespace?: string): Record<string, Record<string, unknown>> {
  const records = listAppSettings(namespace);

  return records.reduce<Record<string, Record<string, unknown>>>((acc, record) => {
    acc[record.namespace] ??= {};
    acc[record.namespace][record.key] = record.value;
    return acc;
  }, {});
}
