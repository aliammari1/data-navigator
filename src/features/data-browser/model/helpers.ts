import type { ColType, ColumnDef, FilterGroup, SortConfig } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Operand for a numeric comparison (>, >=, <, <=, and BETWEEN bounds). A genuine
 * finite number is emitted unquoted (numeric comparison); anything else — text,
 * a date string, or an injection attempt like `5 OR 1=1` — is emitted as a
 * safely-quoted string literal so it can never break out of the clause. Replaces
 * the previous raw `${r.value}` interpolation.
 */
function comparisonOperand(value: string): string {
  const trimmed = value.trim();
  const n = Number(trimmed);
  return trimmed !== "" && Number.isFinite(n) ? String(n) : quoteLiteral(value);
}

export function inferColType(_key: string, sample: unknown): ColType {
  if (typeof sample === "boolean") return "boolean";
  if (typeof sample === "number") return "number";
  if (typeof sample === "string") {
    if (/^[\w.+%-]+@[\w-]+\.\w{2,}$/.test(sample)) return "email";
    if (/^https?:\/\//.test(sample)) return "url";
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return "date";
  }
  return "string";
}

export function formatCellValue(value: unknown, type: ColType): string {
  if (value === null || value === undefined) return "";
  if (type === "number" && typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (type === "boolean") return String(value) === "true" ? "✓" : "✗";
  return String(value);
}

export function buildWhereClause(group: FilterGroup): string {
  const parts = group.rules
    .filter((r) => r.active)
    .map((r) => {
      const col = quoteIdentifier(r.column);
      switch (r.operator) {
        case "eq":
          return `${col} = ${quoteLiteral(r.value)}`;
        case "neq":
          return `${col} != ${quoteLiteral(r.value)}`;
        case "gt":
          return `${col} > ${comparisonOperand(r.value)}`;
        case "gte":
          return `${col} >= ${comparisonOperand(r.value)}`;
        case "lt":
          return `${col} < ${comparisonOperand(r.value)}`;
        case "lte":
          return `${col} <= ${comparisonOperand(r.value)}`;
        case "contains":
          return `${col} LIKE ${quoteLiteral(`%${r.value}%`)}`;
        case "not_contains":
          return `${col} NOT LIKE ${quoteLiteral(`%${r.value}%`)}`;
        case "starts_with":
          return `${col} LIKE ${quoteLiteral(`${r.value}%`)}`;
        case "ends_with":
          return `${col} LIKE ${quoteLiteral(`%${r.value}`)}`;
        case "is_null":
          return `${col} IS NULL`;
        case "is_not_null":
          return `${col} IS NOT NULL`;
        case "in":
          return `${col} IN (${r.value
            .split(",")
            .map((v) => quoteLiteral(v.trim()))
            .join(", ")})`;
        case "between": {
          // `??` only catches null/undefined — an empty-string value2 must also
          // fall back, else the clause gets a dangling `BETWEEN x AND `.
          const upper = r.value2?.trim() ? r.value2 : r.value;
          return `${col} BETWEEN ${comparisonOperand(r.value)} AND ${comparisonOperand(upper)}`;
        }
        default:
          return "1=1";
      }
    });

  if (parts.length === 0) return "";
  return parts.join(` ${group.logic} `);
}

/**
 * Build an ILIKE predicate across text-like columns so global search runs in
 * DuckDB (offline-correct over the FULL dataset) instead of fuzzy-matching the
 * in-memory page. Returns "" when there is nothing to search.
 */
export function buildSearchPredicate(term: string, columns: ColumnDef[]): string {
  const trimmed = term.trim();
  if (!trimmed) return "";

  const searchable = columns.filter(
    (c) => c.type === "string" || c.type === "email" || c.type === "url",
  );
  // Fall back to every column when no obvious text column was inferred.
  const targets = searchable.length > 0 ? searchable : columns;
  if (targets.length === 0) return "";

  const literal = quoteLiteral(`%${trimmed}%`);
  return targets
    .map((c) => `CAST(${quoteIdentifier(c.name)} AS VARCHAR) ILIKE ${literal}`)
    .join(" OR ");
}

/**
 * Compose the full WHERE clause from the active filter group plus an optional
 * global search term. Both are pushed down to the engine.
 */
export function composeWhereClause(
  filterGroup: FilterGroup,
  search: string,
  columns: ColumnDef[],
): string {
  const filter = buildWhereClause(filterGroup);
  const searchPredicate = buildSearchPredicate(search, columns);
  const parts: string[] = [];
  if (filter) parts.push(`(${filter})`);
  if (searchPredicate) parts.push(`(${searchPredicate})`);
  return parts.join(" AND ");
}

function buildOrderBy(sorts: SortConfig[]): string {
  if (sorts.length === 0) return "";
  const orderParts = [...sorts]
    .sort((a, b) => a.priority - b.priority)
    .map((s) => `${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}`);
  return ` ORDER BY ${orderParts.join(", ")}`;
}

function buildProjection(columns: ColumnDef[]): string {
  const visible = columns.filter((c) => c.visible);
  // Empty projection would be invalid SQL — fall back to all rows.
  if (visible.length === 0) return "*";
  return visible.map((c) => quoteIdentifier(c.name)).join(", ");
}

export function generateSQL(
  tableName: string,
  columns: ColumnDef[],
  sorts: SortConfig[],
  whereClause: string,
  limit: number,
  offset: number,
): string {
  let sql = `SELECT ${buildProjection(columns)} FROM ${quoteIdentifier(tableName)}`;
  if (whereClause) sql += ` WHERE ${whereClause}`;
  sql += buildOrderBy(sorts);
  sql += ` LIMIT ${limit} OFFSET ${offset}`;
  return sql;
}

/**
 * COUNT(*) for a given table + composed WHERE clause. Kept separate so the
 * caller can cache it per (table, where) and run it in parallel with the page
 * query rather than re-counting on every sort/page change.
 */
export function generateCountSQL(tableName: string, whereClause: string): string {
  let sql = `SELECT COUNT(*) AS cnt FROM ${quoteIdentifier(tableName)}`;
  if (whereClause) sql += ` WHERE ${whereClause}`;
  return sql;
}

/**
 * Full filtered/sorted projection with NO limit — used to stream the complete
 * result set into an export (CSV / XLSX / JSON) instead of silently exporting
 * only the visible page.
 */
export function generateExportSQL(
  tableName: string,
  columns: ColumnDef[],
  sorts: SortConfig[],
  whereClause: string,
  hardLimit?: number,
): string {
  let sql = `SELECT ${buildProjection(columns)} FROM ${quoteIdentifier(tableName)}`;
  if (whereClause) sql += ` WHERE ${whereClause}`;
  sql += buildOrderBy(sorts);
  if (hardLimit && hardLimit > 0) sql += ` LIMIT ${hardLimit}`;
  return sql;
}
