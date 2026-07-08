/**
 * Quote-aware safety guard for a renderer-supplied WHERE fragment that gets
 * interpolated into a main-process DuckDB query (countRows / keyset paging).
 *
 * The query connection is already read-only, but read-only mode alone does not
 * stop every abuse: statement chaining (`1=1; ATTACH ...`), comment-outs, or a
 * file/IO table-function used for exfiltration (`x IN (SELECT * FROM
 * read_csv('/etc/passwd'))`). This guard is the defense-in-depth that the raw
 * `${where}` interpolation was missing.
 *
 * It is QUOTE-AWARE: text inside single-quoted string literals — where user
 * filter VALUES live, already '' -escaped by the renderer query builders — is
 * neutralised before inspection, so a legitimate value like `'UPDATE_PENDING'`
 * or `'a; drop'` never trips the guard. Only the SQL *code* between literals is
 * inspected. Pure + synchronous so it is unit-tested without DuckDB.
 */

const STATEMENT_SEPARATOR = /;/;
const SQL_COMMENT = /--|\/\*|\*\//;
const STATEMENT_KEYWORD =
  /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|COPY|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|CALL|PRAGMA|SET)\b/i;
const FILE_IO_FUNCTION =
  /\b(read_csv(_auto)?|read_parquet|parquet_\w+|read_json(_auto|_objects)?|read_ndjson(_auto)?|read_text|read_blob|sniff_csv|glob|getenv)\s*\(/i;

/** Replace every single-quoted string literal (with `''` escapes) by an empty one. */
function stripStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Throws if a WHERE fragment contains an injection vector outside string
 * literals; otherwise returns it unchanged for convenient inlining.
 */
export function assertSafeFilterFragment(where: string): string {
  const code = stripStringLiterals(where);
  if (STATEMENT_SEPARATOR.test(code)) {
    throw new Error("Unsafe filter: statement separator (;) is not allowed.");
  }
  if (SQL_COMMENT.test(code)) {
    throw new Error("Unsafe filter: SQL comments are not allowed.");
  }
  if (STATEMENT_KEYWORD.test(code)) {
    throw new Error("Unsafe filter: statement keywords are not allowed.");
  }
  if (FILE_IO_FUNCTION.test(code)) {
    throw new Error("Unsafe filter: file/IO functions are not allowed.");
  }
  return where;
}
