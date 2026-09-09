/** Compact French relative time ("à l'instant", "5 min", "2 h", "3 j"). */
export function relativeTime(input: string | number | Date | undefined): string {
  if (!input) return "";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "";
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const day = Math.round(h / 24);
  return `${day} j`;
}
