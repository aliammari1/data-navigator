/**
 * Python derivation engine — the formulator "python" lane (contract: model.ts).
 *
 * Runs the LLM-generated pandas script in the self-hosted Pyodide sandbox
 * (src/platform/python-sandbox): parent rows go in as `df` (PY_INPUT_VAR),
 * the script must assign `result` (PY_OUTPUT_VAR), and a fixed epilogue
 * validates/coerces the frame, clamps it to MAX_DERIVED_ROWS and ships it
 * back as JSON records. Each thread node gets its own sandbox session so
 * reruns and sibling derivations cannot bleed state.
 *
 * No "use client": importable anywhere, but the sandbox worker needs a
 * browser context at runtime (same stance as platform/ai/pyodide-ml.ts).
 */

import {
  ensureSandboxReady,
  installPackages,
  loadDataFrame,
  resetSession,
  runPython,
} from "@/platform/python-sandbox/core";
import { inferType } from "../helpers";
import type { ColumnInfo } from "../types";
import {
  MAX_DERIVED_ROWS,
  MAX_PY_INPUT_ROWS,
  PY_INPUT_VAR,
  PY_OUTPUT_VAR,
  type Row,
} from "./model";

// ─── Result contract ─────────────────────────────────────────────────────────

export interface PythonDerivationInput {
  parentRows: Row[];
  code: string;
  nodeId: string;
  onProgress?: (s: string) => void;
}

export interface PythonDerivationSuccess {
  ok: true;
  rows: Row[];
  columns: ColumnInfo[];
  rowCount: number;
  /** True when the result frame was clamped to MAX_DERIVED_ROWS. */
  truncated: boolean;
  stdout: string;
}

export interface PythonDerivationFailure {
  ok: false;
  /** Fed verbatim to the LLM repair loop — sanitized Python traceback tail. */
  error: string;
  stdout: string;
}

export type PythonDerivationResult = PythonDerivationSuccess | PythonDerivationFailure;

// ─── Payload wire format ─────────────────────────────────────────────────────

/** Marks the start of the epilogue's JSON payload (expression value or stdout line). */
export const PAYLOAD_SENTINEL = "__DN_PAYLOAD__";
/** Follows PAYLOAD_SENTINEL when the frame was clamped to MAX_DERIVED_ROWS. */
export const TRUNCATION_SENTINEL = "__DN_TRUNCATED__";

/** Max lines of Python traceback kept in the repair-loop error string. */
const ERROR_TAIL_LINES = 15;

/** Stable sandbox session per thread node — reruns reuse (and reset) it. */
export function derivationSessionId(nodeId: string): string {
  return `formulator-py-${nodeId}`;
}

/**
 * Fixed post-script run: validate/coerce `result`, clamp, serialize.
 *
 * All helper names are `_dn_`-prefixed so they cannot shadow user variables.
 * The payload doubles as the trailing expression AND a printed stdout line:
 * the sandbox worker exec()s code in "exec" mode, which discards the
 * trailing-expression value, so stdout is the reliable channel — the
 * expression stays for a worker that does return it.
 */
const EPILOGUE = `
import pandas as _dn_pd

if "${PY_OUTPUT_VAR}" not in globals():
    raise RuntimeError(
        "the script must assign a pandas DataFrame to the variable '${PY_OUTPUT_VAR}'"
    )
_dn_out = globals()["${PY_OUTPUT_VAR}"]
if isinstance(_dn_out, _dn_pd.Series):
    _dn_out = _dn_out.to_frame()
elif isinstance(_dn_out, list):
    _dn_out = _dn_pd.DataFrame(_dn_out)
elif not isinstance(_dn_out, _dn_pd.DataFrame):
    raise RuntimeError(
        "'${PY_OUTPUT_VAR}' must be a pandas DataFrame (or Series / list of dicts), got "
        + type(_dn_out).__name__
    )
if isinstance(_dn_out.index, _dn_pd.MultiIndex) or _dn_out.index.name is not None:
    _dn_out = _dn_out.reset_index()
_dn_truncated = len(_dn_out) > ${MAX_DERIVED_ROWS}
if _dn_truncated:
    _dn_out = _dn_out.head(${MAX_DERIVED_ROWS})
_dn_payload = (
    "${PAYLOAD_SENTINEL}"
    + ("${TRUNCATION_SENTINEL}" if _dn_truncated else "")
    + _dn_out.to_json(orient="records", date_format="iso")
)
print(_dn_payload)
_dn_payload
`.trim();

// ─── pandas bootstrap (mirrors platform/ai/pyodide-ml.ts) ────────────────────

let pandasReady = false;
let pandasInit: Promise<boolean> | null = null;

/** Idempotent: loads pandas+numpy from the vendored Pyodide distribution once. */
async function ensurePandas(sessionId: string, onProgress?: (s: string) => void): Promise<boolean> {
  if (pandasReady) return true;
  if (pandasInit) return pandasInit;

  pandasInit = (async (): Promise<boolean> => {
    try {
      await ensureSandboxReady(onProgress);
      onProgress?.("Installing pandas…");
      await installPackages(sessionId, ["pandas", "numpy"], onProgress);
      pandasReady = true;
      return true;
    } catch {
      pandasInit = null; // allow retry on next call
      return false;
    }
  })();

  return pandasInit;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function runPythonDerivation(
  input: PythonDerivationInput,
): Promise<PythonDerivationResult> {
  const { parentRows, code, nodeId, onProgress } = input;
  const sessionId = derivationSessionId(nodeId);
  let stdout = "";
  let stderr = "";
  let epilogueStdout = "";

  try {
    await ensureSandboxReady(onProgress);
    // Fresh namespace per run: a rerun of a node must not see stale variables.
    await resetSession(sessionId);
    const pandasOk = await ensurePandas(sessionId, onProgress);
    if (!pandasOk) {
      return {
        ok: false,
        error: "pandas is unavailable in the Python sandbox (vendored Pyodide packages missing)",
        stdout,
      };
    }

    const inputRows =
      parentRows.length > MAX_PY_INPUT_ROWS ? parentRows.slice(0, MAX_PY_INPUT_ROWS) : parentRows;
    await loadDataFrame(sessionId, PY_INPUT_VAR, inputRows, onProgress);

    onProgress?.("Running the pandas script…");
    await runPython(code, {
      sessionId,
      onProgress,
      onStdout: (s) => {
        stdout += s;
      },
      onStderr: (s) => {
        stderr += s;
      },
    });

    const { value } = await runPython(EPILOGUE, {
      sessionId,
      onProgress,
      // Separate buffer: the payload line is wire format, not user stdout.
      onStdout: (s) => {
        epilogueStdout += s;
      },
      onStderr: (s) => {
        stderr += s;
      },
    });

    const payload = extractPayload(value, epilogueStdout);
    if (payload === null) {
      return {
        ok: false,
        error: `the sandbox returned no '${PY_OUTPUT_VAR}' payload`,
        stdout,
      };
    }
    const truncated = payload.startsWith(TRUNCATION_SENTINEL);
    const json = truncated ? payload.slice(TRUNCATION_SENTINEL.length) : payload;
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        error: `'${PY_OUTPUT_VAR}' did not serialize to a JSON array of records`,
        stdout,
      };
    }
    const rows = parsed as Row[];
    return {
      ok: true,
      rows,
      columns: inferColumns(rows),
      rowCount: rows.length,
      truncated,
      stdout,
    };
  } catch (err) {
    return { ok: false, error: buildRepairError(err, stderr), stdout };
  }
}

/** Drop a node's sandbox namespace when its thread card is deleted. */
export async function disposeDerivationSession(nodeId: string): Promise<void> {
  await resetSession(derivationSessionId(nodeId));
}

// ─── Payload extraction ──────────────────────────────────────────────────────

function extractPayload(value: unknown, epilogueStdout: string): string | null {
  const source =
    typeof value === "string" && value.includes(PAYLOAD_SENTINEL) ? value : epilogueStdout;
  const idx = source.lastIndexOf(PAYLOAD_SENTINEL);
  if (idx === -1) return null;
  const rest = source.slice(idx + PAYLOAD_SENTINEL.length);
  // stdout path: the payload occupies one line (to_json emits no raw newlines).
  const newline = rest.indexOf("\n");
  return newline === -1 ? rest : rest.slice(0, newline);
}

// ─── Column inference ────────────────────────────────────────────────────────

/** to_json(date_format="iso") emits datetimes as ISO-8601 strings. */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function jsValueDbType(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) ? "BIGINT" : "DOUBLE";
  if (typeof v === "boolean") return "BOOLEAN";
  if (typeof v === "string") return ISO_DATE_RE.test(v) ? "TIMESTAMP" : "VARCHAR";
  return "VARCHAR";
}

function inferColumns(rows: Row[]): ColumnInfo[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        names.push(key);
      }
    }
  }
  return names.map((name) => {
    let dbType: string | null = null;
    for (const row of rows) {
      dbType = jsValueDbType(row[name]);
      if (dbType !== null) break;
    }
    const resolved = dbType ?? "VARCHAR";
    return { name, type: inferType(resolved), dbType: resolved };
  });
}

// ─── Error sanitation (repair-loop input) ────────────────────────────────────

/** Pyodide-internal frames that only add noise for the repair LLM. */
const PYODIDE_FRAME_RE =
  /\/lib\/python\d|_pyodide\/|\/pyodide\/|site-packages\/(?:pyodide|micropip)/;

/**
 * Keep the useful tail of a Python traceback: drop Pyodide bootstrap frames
 * (header + its indented source-context lines), then keep the last
 * ERROR_TAIL_LINES lines — the frames in user code plus the exception line.
 */
function sanitizePythonError(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let droppingFrame = false;
  for (const line of lines) {
    if (/^\s*File "/.test(line)) {
      droppingFrame = PYODIDE_FRAME_RE.test(line);
      if (droppingFrame) continue;
    } else if (droppingFrame) {
      if (/^\s/.test(line)) continue;
      droppingFrame = false;
    }
    kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop();
  const tail = kept.slice(-ERROR_TAIL_LINES).join("\n").trim();
  return tail.length > 0 ? tail : raw.trim();
}

function buildRepairError(err: unknown, stderr: string): string {
  const sanitized = sanitizePythonError(err instanceof Error ? err.message : String(err));
  const stderrTail = sanitizePythonError(stderr);
  if (stderrTail.length > 0 && !sanitized.includes(stderrTail)) {
    return `${sanitized}\n${stderrTail}`.trim();
  }
  return sanitized;
}
