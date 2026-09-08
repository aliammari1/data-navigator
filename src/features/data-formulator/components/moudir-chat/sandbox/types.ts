/**
 * In-chat code execution — shared types.
 *
 * The chat renders two code-block languages as compact executable cards:
 *   ```js-run     → sandboxed iframe, native JS via Function constructor
 *   ```python-run → sandboxed iframe, Pyodide (opt-in, lazy-loaded)
 *
 * Each block is parsed out of the model's streaming prose by extractCodeBlocks
 * and rendered side-by-side with the rest of the message. The model never
 * generates these blocks on its own — the system prompt (DEFAULT_SYSTEM_PROMPT)
 * is the only place that teaches the convention.
 */

export type CodeBlockKind = "js-run" | "python-run";

export interface CodeBlock {
  kind: CodeBlockKind;
  source: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  value: string | null;
  durationMs: number;
  timedOut: boolean;
  error: string | null;
}

export type { PyodideRunResult } from "@/platform/pyodide/pyodide-client";

export const PYODIDE_VERSION = "0.26.2";
export const PYODIDE_RUNTIME_URL = "/pyodide/";
