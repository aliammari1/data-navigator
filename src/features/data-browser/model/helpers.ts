import type { ColType, ColumnDef, FilterGroup, SortConfig } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quoteIdentifier(value: string): string {
  return `"${value.replace('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace("'", "''")}'`;
}

export function inferColType(key: string, sample: unknown): ColType {
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
          return `${col} > ${r.value}`;
        case "gte":
          return `${col} >= ${r.value}`;
        case "lt":
          return `${col} < ${r.value}`;
        case "lte":
          return `${col} <= ${r.value}`;
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
        case "between":
          return `${col} BETWEEN ${r.value} AND ${r.value2 ?? r.value}`;
        default:
          return "1=1";
      }
    });

  if (parts.length === 0) return "";
  return parts.join(` ${group.logic} `);
}

export function generateSQL(
  tableName: string,
  columns: ColumnDef[],
  sorts: SortConfig[],
  filterGroup: FilterGroup,
  limit: number,
  offset: number,
): string {
  const visibleCols = columns
    .filter((c) => c.visible)
    .map((c) => quoteIdentifier(c.name))
    .join(", ");

  let sql = `SELECT ${visibleCols} FROM ${quoteIdentifier(tableName)}`;

  const whereClause = buildWhereClause(filterGroup);
  if (whereClause) sql += ` WHERE ${whereClause}`;

  if (sorts.length > 0) {
    const orderParts = [...sorts]
      .sort((a, b) => a.priority - b.priority)
      .map((s) => `${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}`);
    sql += ` ORDER BY ${orderParts.join(", ")}`;
  }

  sql += ` LIMIT ${limit} OFFSET ${offset}`;
  return sql;
}
