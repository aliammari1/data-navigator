/**
 * Wire protocol shared between the MAIN-process DuckDB utility broker
 * (electron/workers/duckdb-utility-broker.ts) and the isolated utilityProcess
 * host (electron/workers/duckdb.utility.ts).
 *
 * Pure + dependency-free (no `electron`, no `@duckdb/node-api`) so it can be
 * imported by both sides and unit-tested in isolation. Messages are plain JSON
 * objects carried over a `MessagePortMain` channel established at fork time.
 *
 * Design notes (utilityProcess isolation scaffold — blueprint "native parsers in
 * a utilityProcess isolated from the secret-holding main"):
 * - The broker (main) is the CLIENT: it sends `*Request` messages, each tagged
 *   with a monotonic `id`, and awaits the matching `*Response`.
 * - The utility (child) is the SERVER: it never initiates a request; it only
 *   replies. This keeps the secret-holding main strictly in control.
 * - Everything crossing the boundary is a structured-clone-safe value. For the
 *   scaffold we transport read results as JSON rows; large Arrow transport can
 *   be layered on later behind the same id-correlated envelope.
 */

/** Request envelope: broker → utility. Discriminated by `kind`. */
export type UtilityRequest = InitRequest | RunReadOnlyQueryRequest | PingRequest;

/** Response envelope: utility → broker. Correlated to a request by `id`. */
export type UtilityResponse =
  | InitResponse
  | RunReadOnlyQueryResponse
  | PingResponse
  | ErrorResponse;

export interface RequestBase {
  /** Monotonic correlation id assigned by the broker. */
  readonly id: number;
  readonly kind: string;
}

export interface ResponseBase {
  /** Echoes the originating request's `id`. */
  readonly id: number;
  readonly ok: boolean;
}

/**
 * One-time handshake. The secret-holding main passes ONLY the non-secret
 * filesystem locations the utility legitimately needs (the managed datasets +
 * spill dirs). No auth secret, no DB credentials cross this boundary.
 */
export interface InitRequest extends RequestBase {
  readonly kind: "init";
  readonly userDataDir: string;
  readonly datasetsDir: string;
  readonly tmpSpillDir: string;
  readonly threads: number;
  readonly memoryLimit: string;
}

export interface InitResponse extends ResponseBase {
  readonly kind: "init";
  readonly ok: true;
  /** Whether the engine read-connection sandbox SET statements all applied. */
  readonly sandboxApplied: boolean;
}

/**
 * Run a single read-only SQL statement. The utility re-validates the SQL with
 * the SAME textual guard the in-main path uses (defense-in-depth) and executes
 * it on a filesystem-sandboxed read connection.
 */
export interface RunReadOnlyQueryRequest extends RequestBase {
  readonly kind: "runReadOnlyQuery";
  readonly sql: string;
}

export interface RunReadOnlyQueryResponse extends ResponseBase {
  readonly kind: "runReadOnlyQuery";
  readonly ok: true;
  readonly rows: Record<string, unknown>[];
}

/** Liveness probe used by the broker to confirm the child is responsive. */
export interface PingRequest extends RequestBase {
  readonly kind: "ping";
}

export interface PingResponse extends ResponseBase {
  readonly kind: "ping";
  readonly ok: true;
  readonly pong: true;
}

/** Uniform failure envelope for any request `kind`. */
export interface ErrorResponse extends ResponseBase {
  readonly kind: "error";
  readonly ok: false;
  readonly message: string;
}

export function isErrorResponse(value: UtilityResponse): value is ErrorResponse {
  return value.ok === false && value.kind === "error";
}
