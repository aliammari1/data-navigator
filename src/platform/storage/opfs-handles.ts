/**
 * OPFS (Origin Private File System) helpers for BIG blobs — worker-only.
 *
 * Architecture §1/§2: big binary assets (Parquet cache, model weights, PMTiles
 * archives, Pyodide runtime) live in OPFS via `createSyncAccessHandle`
 * (~10× faster than IndexedDB), while small structured records live in Dexie
 * (`app-db.ts`). This is a thin, typed wrapper around that API.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ WORKER-ONLY. `FileSystemFileHandle.createSyncAccessHandle()` exists ONLY │
 * │ in a DedicatedWorker/SharedWorker context, never on the renderer main    │
 * │ thread. Importing this module from the main thread is fine, but the sync │
 * │ read/write/flush methods will throw there — use `OPFSBlobStore.read*` /  │
 * │ `write*` only inside a Comlink worker. The async helpers (`exists`,      │
 * │ `delete`, `list`, `size`, `readBlob`/`writeBlob`) are safe everywhere.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Zero network: OPFS is local-only. Nothing here fetches.
 *
 * Typing note: this module is imported by BOTH main-thread and worker code, so
 * it cannot pull in the whole `webworker` lib (that conflicts with the DOM lib
 * in the shared `tsc` program). The two worker-only globals it needs
 * (`FileSystemSyncAccessHandle`, `WorkerGlobalScope`) are declared minimally
 * below; the runtime guard `isSyncAccessAvailable()` ensures they are only
 * touched where they actually exist.
 */

// ─── Worker-only type shims (avoid pulling the whole webworker lib) ───────────

interface FileSystemReadWriteOptions {
  at?: number;
}
interface FileSystemSyncAccessHandle {
  read(buffer: ArrayBufferView, options?: FileSystemReadWriteOptions): number;
  write(buffer: ArrayBufferView, options?: FileSystemReadWriteOptions): number;
  truncate(newSize: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}
declare const WorkerGlobalScope:
  | { prototype: object; new (): object }
  | undefined;

// ─── Capability detection ─────────────────────────────────────────────────────

/** True when the async OPFS root is reachable (main thread OR worker). */
export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

/**
 * True when synchronous access handles are usable — i.e. we are in a Worker AND
 * the API exists. The renderer main thread returns `false`.
 */
export function isSyncAccessAvailable(): boolean {
  const wgs = WorkerGlobalScope;
  const inWorker =
    typeof wgs !== "undefined" &&
    typeof self !== "undefined" &&
    self instanceof (wgs as { new (): object });
  return (
    inWorker &&
    isOpfsAvailable() &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createSyncAccessHandle" in FileSystemFileHandle.prototype
  );
}

// ─── Directory / handle resolution ────────────────────────────────────────────

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsAvailable()) {
    throw new Error("OPFS is not available in this context");
  }
  return navigator.storage.getDirectory();
}

/**
 * Resolve a directory handle for a "/"-separated path, creating segments when
 * `create` is true. `""` / `"/"` resolves to the OPFS root.
 */
export async function getDir(
  path = "",
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let dir = await getRoot();
  const segments = path.split("/").filter(Boolean);
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

/** Split "a/b/file.bin" → { dirPath: "a/b", name: "file.bin" }. */
function splitPath(filePath: string): { dirPath: string; name: string } {
  const clean = filePath.replace(/^\/+/, "");
  const idx = clean.lastIndexOf("/");
  if (idx === -1) return { dirPath: "", name: clean };
  return { dirPath: clean.slice(0, idx), name: clean.slice(idx + 1) };
}

async function getFileHandle(
  filePath: string,
  create = false,
): Promise<FileSystemFileHandle> {
  const { dirPath, name } = splitPath(filePath);
  const dir = await getDir(dirPath, create);
  return dir.getFileHandle(name, { create });
}

// ─── Async (main-thread-safe) operations ──────────────────────────────────────

export async function exists(filePath: string): Promise<boolean> {
  try {
    await getFileHandle(filePath, false);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  const { dirPath, name } = splitPath(filePath);
  try {
    const dir = await getDir(dirPath, false);
    await dir.removeEntry(name);
  } catch {
    // already gone
  }
}

/** Recursively remove a directory and its contents. */
export async function deleteDir(path: string): Promise<void> {
  const { dirPath, name } = splitPath(path);
  try {
    const parent = await getDir(dirPath, false);
    await parent.removeEntry(name, { recursive: true });
  } catch {
    // already gone
  }
}

export interface OpfsEntry {
  name: string;
  kind: "file" | "directory";
  size?: number;
}

/** List immediate children of a directory (one level). */
export async function list(path = ""): Promise<OpfsEntry[]> {
  const dir = await getDir(path, false);
  const out: OpfsEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      out.push({ name, kind: "file", size: file.size });
    } else {
      out.push({ name, kind: "directory" });
    }
  }
  return out;
}

export async function size(filePath: string): Promise<number> {
  try {
    const handle = await getFileHandle(filePath, false);
    const file = await handle.getFile();
    return file.size;
  } catch {
    return 0;
  }
}

/**
 * Total byte size of a directory subtree (e.g. the model-cache dir for the
 * Settings storage panel). Walks recursively.
 */
export async function dirSize(path = ""): Promise<number> {
  let total = 0;
  const stack: string[] = [path];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await getDir(current, false);
    } catch {
      continue;
    }
    for await (const [name, handle] of dir.entries()) {
      const childPath = current ? `${current}/${name}` : name;
      if (handle.kind === "file") {
        const file = await (handle as FileSystemFileHandle).getFile();
        total += file.size;
      } else {
        stack.push(childPath);
      }
    }
  }
  return total;
}

/**
 * Async read of a whole file as an ArrayBuffer (main-thread-safe, uses
 * `getFile()` not a sync handle). Returns null when absent.
 */
export async function readBlob(filePath: string): Promise<ArrayBuffer | null> {
  try {
    const handle = await getFileHandle(filePath, false);
    const file = await handle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Async whole-file write. Prefer `OPFSBlobStore.writeAll` in a worker for big
 * blobs (no extra stream copy); this is the convenient main-thread/fallback
 * path used when a sync handle is unavailable.
 */
export async function writeBlob(
  filePath: string,
  data: ArrayBuffer | ArrayBufferView | Blob,
): Promise<void> {
  const handle = await getFileHandle(filePath, true);
  // createWritable is available on the main thread; createSyncAccessHandle is not.
  const writable = await handle.createWritable();
  try {
    await writable.write(data as FileSystemWriteChunkType);
  } finally {
    await writable.close();
  }
}

// ─── Sync (WORKER-ONLY) access-handle store ───────────────────────────────────

/**
 * A typed handle around `FileSystemSyncAccessHandle` for streaming/random big-
 * blob IO inside a worker. Open it, read/write at offsets, then `close()`.
 * Only ONE sync access handle may be open per file at a time.
 */
export class OPFSSyncFile {
  private constructor(
    readonly path: string,
    private handle: FileSystemSyncAccessHandle,
  ) {}

  static async open(filePath: string, create = true): Promise<OPFSSyncFile> {
    if (!isSyncAccessAvailable()) {
      throw new Error(
        "createSyncAccessHandle requires a Worker context with OPFS support",
      );
    }
    const fileHandle = await getFileHandle(filePath, create);
    // createSyncAccessHandle is worker-only and absent from the DOM lib used by
    // the shared tsc program — access it dynamically and cast the result.
    const createSync = (
      fileHandle as unknown as {
        createSyncAccessHandle: () => Promise<FileSystemSyncAccessHandle>;
      }
    ).createSyncAccessHandle.bind(fileHandle);
    const sync = await createSync();
    return new OPFSSyncFile(filePath, sync);
  }

  byteLength(): number {
    return this.handle.getSize();
  }

  /** Read `length` bytes at `at` (defaults to whole file). */
  read(at = 0, length?: number): ArrayBuffer {
    const total = this.handle.getSize();
    const len = length ?? Math.max(0, total - at);
    const out = new ArrayBuffer(len);
    const buf = new Uint8Array(out);
    const got = this.handle.read(buf, { at });
    return got === len ? out : out.slice(0, got);
  }

  /** Write bytes at `at`, returning bytes written. Caller flushes/closes. */
  write(data: ArrayBufferView, at = 0): number {
    return this.handle.write(data, { at });
  }

  truncate(toSize: number): void {
    this.handle.truncate(toSize);
  }

  flush(): void {
    this.handle.flush();
  }

  close(): void {
    this.handle.close();
  }
}

/**
 * High-level worker-side blob store: namespaced whole-file read/write/append
 * over OPFS sync access handles. Designed for the Parquet cache, model weights,
 * PMTiles and Pyodide-runtime use cases the architecture lists.
 *
 * Usage (inside a Comlink worker):
 *   const cache = new OPFSBlobStore("parquet-cache");
 *   await cache.writeAll("dataset-7.parquet", bytes);
 *   const bytes = await cache.readAll("dataset-7.parquet");
 */
export class OPFSBlobStore {
  constructor(private readonly namespace: string) {}

  private key(name: string): string {
    return `${this.namespace}/${name}`;
  }

  /** Whole-file write via a sync handle (fast path). Truncates first. */
  async writeAll(
    name: string,
    data: ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    const view =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (isSyncAccessAvailable()) {
      const file = await OPFSSyncFile.open(this.key(name), true);
      try {
        file.truncate(0);
        file.write(view, 0);
        file.flush();
      } finally {
        file.close();
      }
      return;
    }
    // Async fallback (e.g. called from main thread in a degraded mode).
    await writeBlob(this.key(name), view);
  }

  /** Append bytes to the end of a file (e.g. streaming Parquet write). */
  async append(name: string, data: ArrayBufferView): Promise<void> {
    if (!isSyncAccessAvailable()) {
      throw new Error("append requires a Worker context (sync access handle)");
    }
    const file = await OPFSSyncFile.open(this.key(name), true);
    try {
      file.write(data, file.byteLength());
      file.flush();
    } finally {
      file.close();
    }
  }

  /** Whole-file read. Returns null when absent. */
  async readAll(name: string): Promise<ArrayBuffer | null> {
    if (isSyncAccessAvailable()) {
      if (!(await exists(this.key(name)))) return null;
      const file = await OPFSSyncFile.open(this.key(name), false);
      try {
        return file.read(0);
      } finally {
        file.close();
      }
    }
    return readBlob(this.key(name));
  }

  /** Random range read (e.g. PMTiles range requests) — worker-only. */
  async readRange(
    name: string,
    offset: number,
    length: number,
  ): Promise<ArrayBuffer> {
    const file = await OPFSSyncFile.open(this.key(name), false);
    try {
      return file.read(offset, length);
    } finally {
      file.close();
    }
  }

  has(name: string): Promise<boolean> {
    return exists(this.key(name));
  }

  delete(name: string): Promise<void> {
    return deleteFile(this.key(name));
  }

  list(): Promise<OpfsEntry[]> {
    return list(this.namespace);
  }

  /** Total bytes used by this namespace — surfaced in the Settings panel. */
  totalSize(): Promise<number> {
    return dirSize(this.namespace);
  }

  clear(): Promise<void> {
    return deleteDir(this.namespace);
  }
}

/** Canonical OPFS namespaces used across the app (one place to avoid drift). */
export const OPFS_NS = {
  parquetCache: "parquet-cache",
  modelWeights: "models",
  pmtiles: "pmtiles",
  pyodide: "pyodide",
} as const;
export type OpfsNamespace = (typeof OPFS_NS)[keyof typeof OPFS_NS];
