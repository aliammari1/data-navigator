import type { ChartSpec, DerivedField, FilterDef } from "./types";

function quote(field: string, derivedMap: Map<string, DerivedField>): string {
  const d = derivedMap.get(field);
  if (d) return `(${d.sql})`;
  return `"${field}"`;
}

function buildWhereClause(
  filters: FilterDef[],
  derivedMap: Map<string, DerivedField>,
): string {
  if (!filters.length) return "";
  const parts = filters.map((f) => {
    const lhs = quote(f.field, derivedMap);
    if (f.op === "IS NULL") return `${lhs} IS NULL`;
    if (f.op === "NOT NULL") return `${lhs} IS NOT NULL`;
    if (f.op === "IN") {
      const vals = f.value
        .split(",")
        .map((v) => `'${v.trim().replace(/'/g, "''")}'`)
        .join(",");
      return `${lhs} IN (${vals})`;
    }
    if (f.op === "BETWEEN") {
      const [a, b] = f.value.split(",").map((v) => v.trim());
      return `TRY_CAST(${lhs} AS DOUBLE) BETWEEN ${a} AND ${b}`;
    }
    if (f.op === "LIKE")
      return `CAST(${lhs} AS VARCHAR) LIKE '${f.value.replace(/'/g, "''")}'`;
    const isNum = /^-?\d+(\.\d+)?$/.test(f.value.trim());
    if (isNum) return `TRY_CAST(${lhs} AS DOUBLE) ${f.op} ${f.value.trim()}`;
    return `CAST(${lhs} AS VARCHAR) ${f.op} '${f.value.replace(/'/g, "''")}'`;
  });
  return parts.join(" AND ");
}

function buildAgg(
  agg: string | undefined,
  field: string,
  derivedMap: Map<string, DerivedField>,
): string {
  const expr = quote(field, derivedMap);
  if (!agg || agg === "none") return `TRY_CAST(${expr} AS DOUBLE)`;
  if (agg === "count") return `COUNT(${expr})`;
  if (agg === "distinct") return `COUNT(DISTINCT ${expr})`;
  if (agg === "median") return `MEDIAN(TRY_CAST(${expr} AS DOUBLE))`;
  return `${agg.toUpperCase()}(TRY_CAST(${expr} AS DOUBLE))`;
}

export function buildSQL(
  spec: ChartSpec,
  tableName: string,
  derived: DerivedField[] = [],
): string {
  const derivedMap = new Map(derived.map((d) => [d.name, d]));

  const xEnc = spec.encodings.find((e) => e.channel === "x");
  const yEnc = spec.encodings.find((e) => e.channel === "y");
  const colorEnc = spec.encodings.find((e) => e.channel === "color");
  const sizeEnc = spec.encodings.find((e) => e.channel === "size");

  // Histogram-style binning
  if (xEnc?.bin && xEnc.aggregate === "count") {
    const bin = `WIDTH_BUCKET(TRY_CAST(${quote(xEnc.field, derivedMap)} AS DOUBLE), (SELECT MIN(TRY_CAST(${quote(xEnc.field, derivedMap)} AS DOUBLE)) FROM "${tableName}"), (SELECT MAX(TRY_CAST(${quote(xEnc.field, derivedMap)} AS DOUBLE)) FROM "${tableName}"), 30)`;
    const where = buildWhereClause(spec.filters, derivedMap);
    return `SELECT ${bin} as x_val, COUNT(*) as y_val FROM "${tableName}" ${where ? `WHERE ${where} AND` : "WHERE"} ${quote(xEnc.field, derivedMap)} IS NOT NULL GROUP BY x_val ORDER BY x_val LIMIT ${spec.limit}`;
  }

  const hasAgg = spec.encodings.some(
    (e) => e.aggregate && e.aggregate !== "none",
  );

  const selectParts: string[] = [];
  const groupParts: string[] = [];

  if (xEnc) {
    selectParts.push(`${quote(xEnc.field, derivedMap)} as x_val`);
    if (hasAgg) groupParts.push(quote(xEnc.field, derivedMap));
  }

  if (yEnc) {
    selectParts.push(
      `${buildAgg(yEnc.aggregate, yEnc.field, derivedMap)} as y_val`,
    );
  }

  if (colorEnc) {
    selectParts.push(`${quote(colorEnc.field, derivedMap)} as color_val`);
    if (hasAgg) groupParts.push(quote(colorEnc.field, derivedMap));
  }

  if (sizeEnc) {
    selectParts.push(
      `${buildAgg(sizeEnc.aggregate, sizeEnc.field, derivedMap)} as size_val`,
    );
  }

  if (selectParts.length === 0) {
    return `SELECT * FROM "${tableName}" LIMIT ${spec.limit}`;
  }

  let sql = `SELECT ${selectParts.join(", ")} FROM "${tableName}"`;
  const where = buildWhereClause(spec.filters, derivedMap);
  if (where) sql += ` WHERE ${where}`;
  if (groupParts.length > 0) sql += ` GROUP BY ${groupParts.join(", ")}`;

  const sortEnc = spec.encodings.find((e) => e.sort && e.sort !== "none");
  if (sortEnc) {
    sql += ` ORDER BY y_val ${sortEnc.sort === "desc" ? "DESC" : "ASC"}`;
  } else if (hasAgg && yEnc) {
    sql += ` ORDER BY y_val DESC`;
  }

  const limit = spec.topN ?? spec.limit;
  sql += ` LIMIT ${limit}`;
  return sql;
}
