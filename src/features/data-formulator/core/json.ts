"use client";

export function bigIntJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== "bigint") return value;

  const numericValue = Number(value);
  return Math.abs(numericValue) > Number.MAX_SAFE_INTEGER
    ? value.toString()
    : numericValue;
}

export function sanitizeJsonValue<T>(value: T): T {
  if (typeof value === "bigint") {
    return bigIntJsonReplacer("", value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item)) as T;
  }

  const isBlob =
    typeof Blob !== "undefined" && value instanceof Blob;
  const isFile =
    typeof File !== "undefined" && value instanceof File;

  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !isBlob &&
    !isFile
  ) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value)) {
      sanitized[key] = sanitizeJsonValue(childValue);
    }
    return sanitized as T;
  }

  return value;
}

export function safeJsonStringify(
  value: unknown,
  space?: number,
): string {
  try {
    return JSON.stringify(value, bigIntJsonReplacer, space);
  } catch (err) {
    return JSON.stringify(
      {
        error: "Unable to serialize value",
        message: err instanceof Error ? err.message : String(err),
      },
      null,
      space,
    );
  }
}
