/**
 * Filter-expression compiler.
 *
 * The legacy screen re-parsed the filter string *per row, per render*. Here we
 * compile the expression ONCE into a predicate and run it many times. The
 * predicate reads a plain record so it can drive arquero's `filter`/`escape`
 * just as well as a manual loop.
 */

export type RowRecord = Record<string, unknown>;
export type RowPredicate = (row: RowRecord) => boolean;

const COMPARE_RE = /^(\w+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/i;
const LIKE_RE = /^(\w+)\s+LIKE\s+%(.+)%$/i;

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Compile a filter expression to a predicate, or `null` when the expression is
 * empty or unrecognized (meaning "no filter — keep every row").
 */
export function compileFilter(expr: string): RowPredicate | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const compare = trimmed.match(COMPARE_RE);
  if (compare) {
    const [, col, op, rawTarget] = compare;
    const target = unquote(rawTarget);
    const targetLower = target.toLowerCase();
    const targetNumber = Number(target);
    const targetIsNumber = !Number.isNaN(targetNumber) && target !== "";

    return (row: RowRecord): boolean => {
      const value = row[col];
      const valueText = String(value ?? "").toLowerCase();

      switch (op) {
        case "=":
          return valueText === targetLower;
        case "!=":
          return valueText !== targetLower;
        default:
          break;
      }

      if (!targetIsNumber) return true;
      const valueNumber = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(valueNumber)) return false;

      switch (op) {
        case ">":
          return valueNumber > targetNumber;
        case "<":
          return valueNumber < targetNumber;
        case ">=":
          return valueNumber >= targetNumber;
        case "<=":
          return valueNumber <= targetNumber;
        default:
          return true;
      }
    };
  }

  const like = trimmed.match(LIKE_RE);
  if (like) {
    const [, col, sub] = like;
    const needle = sub.toLowerCase();
    return (row: RowRecord): boolean =>
      String(row[col] ?? "")
        .toLowerCase()
        .includes(needle);
  }

  return null;
}
