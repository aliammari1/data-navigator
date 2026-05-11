import type { DiffLine } from "./types";

// ─── Myers diff algorithm ──────────────────────────────────────────────────

export function computeDiff(
  oldLines: string[],
  newLines: string[],
): DiffLine[] {
  const M = oldLines.length;
  const N = newLines.length;
  const MAX = M + N;
  const V: number[] = new Array(2 * MAX + 1).fill(0);
  const trace: number[][] = [];

  // Forward pass
  for (let d = 0; d <= MAX; d++) {
    trace.push([...V]);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
        x = V[k + 1 + MAX];
      } else {
        x = V[k - 1 + MAX] + 1;
      }
      let y = x - k;
      while (x < M && y < N && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      V[k + MAX] = x;
      if (x >= M && y >= N) {
        // Backtrack
        return backtrack(trace, oldLines, newLines, MAX);
      }
    }
  }
  return backtrack(trace, oldLines, newLines, MAX);
}

function backtrack(
  trace: number[][],
  oldLines: string[],
  newLines: string[],
  MAX: number,
): DiffLine[] {
  const edits: Array<{
    type: "=" | "+" | "-";
    old?: number;
    new?: number;
    content: string;
  }> = [];
  let x = oldLines.length;
  let y = newLines.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const V = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = V[prevK + MAX];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.unshift({ type: "=", old: x, new: y, content: oldLines[x] });
    }
    if (d > 0) {
      if (x === prevX) {
        edits.unshift({ type: "+", new: prevY, content: newLines[prevY] });
      } else {
        edits.unshift({ type: "-", old: prevX, content: oldLines[prevX] });
      }
    }
    x = prevX;
    y = prevY;
  }

  // Convert to DiffLine with context (3 lines around changes)
  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const e of edits) {
    if (e.type === "=") {
      result.push({ type: "context", oldLine, newLine, content: e.content });
      oldLine++;
      newLine++;
    } else if (e.type === "-") {
      result.push({ type: "removed", oldLine, content: e.content });
      oldLine++;
    } else {
      result.push({ type: "added", newLine, content: e.content });
      newLine++;
    }
  }
  return result;
}

export function applyContextWindow(lines: DiffLine[], window = 3): DiffLine[] {
  const changes = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "context") changes.add(i);
  });
  const keep = new Set<number>();
  for (const ci of changes) {
    for (
      let k = Math.max(0, ci - window);
      k <= Math.min(lines.length - 1, ci + window);
      k++
    ) {
      keep.add(k);
    }
  }

  const result: DiffLine[] = [];
  let prevIncluded = true;
  for (let i = 0; i < lines.length; i++) {
    if (keep.has(i)) {
      if (!prevIncluded && i > 0) {
        result.push({
          type: "hunk",
          content: `@@ -${lines[i].oldLine ?? 0} @@`,
        });
      }
      result.push(lines[i]);
      prevIncluded = true;
    } else {
      prevIncluded = false;
    }
  }
  return result;
}
