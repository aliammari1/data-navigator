const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|alter|create|attach|copy|pragma|truncate|replace|grant|revoke|vacuum|export|install|load)\b/i;

const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Strip the wrapping an LLM frequently adds around SQL — markdown code
 * fences, leading `--`/block comments, and trailing semicolons.
 */
function sanitizeSql(sql: string): string {
  let s = sql.replace(INVISIBLE_CHARS, "").trim();
  const fence = s.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  s = s.replace(/^(\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/i, "").trim();
  s = s.replace(/;+\s*$/, "").trim();
  return s;
}

/**
 * Assert an AI-written statement is a single read-only SELECT/WITH.
 */
export function assertReadOnlySql(sql: string): string {
  const trimmed = sanitizeSql(sql);
  if (!/^\s*(select|with)\b/i.test(trimmed)) {
    throw new Error("AI SQL rejected: only SELECT/WITH queries are allowed.");
  }
  if (FORBIDDEN_SQL.test(trimmed)) {
    throw new Error("AI SQL rejected: contains a non-read-only keyword.");
  }
  if (trimmed.includes(";")) {
    throw new Error("AI SQL rejected: multiple statements are not allowed.");
  }
  return trimmed;
}
