"use client";

import type { BlackboardState } from "./types";

const DB_NAME = "data-navigator-agent-mesh";
const DB_VERSION = 1;
const STORE = "agent_mesh_runs";
const MAX_RUNS = 20;

export interface AgentMeshRunRecord {
  id: string;
  savedAt: number;
  objective: string;
  mode: string;
  table?: string;
  fileName?: string;
  evidenceCount: number;
  acceptedCount: number;
  taskCount: number;
  completedTaskCount: number;
  headline?: string;
  state: BlackboardState;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function makeRecordId(): string {
  return `mesh-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRunRecord(
  state: BlackboardState,
  objective: string,
  fileName?: string,
): AgentMeshRunRecord {
  const plan = state.plan.activePlan;
  return {
    id: makeRecordId(),
    savedAt: Date.now(),
    objective,
    mode: plan?.mode ?? "full_story",
    table: state.dataset.activeTable,
    fileName,
    evidenceCount: state.evidence.items.length,
    acceptedCount: state.evidence.acceptedIds.length,
    taskCount: plan?.tasks.length ?? 0,
    completedTaskCount: state.plan.completedTaskIds.length,
    headline: state.decisions.headline,
    state,
  };
}

export async function saveAgentMeshRun(
  record: AgentMeshRunRecord,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).finally(() => db.close());
  await pruneAgentMeshRuns();
}

export async function listAgentMeshRuns(): Promise<AgentMeshRunRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDB();
    return await new Promise<AgentMeshRunRecord[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        resolve(
          ((req.result as AgentMeshRunRecord[]) ?? []).sort(
            (a, b) => b.savedAt - a.savedAt,
          ),
        );
      };
      req.onerror = () => resolve([]);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function deleteAgentMeshRun(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    }).finally(() => db.close());
  } catch {}
}

export async function clearAgentMeshRuns(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    }).finally(() => db.close());
  } catch {}
}

async function pruneAgentMeshRuns(maxRuns = MAX_RUNS): Promise<void> {
  const runs = await listAgentMeshRuns();
  const stale = runs.slice(maxRuns);
  await Promise.all(stale.map((run) => deleteAgentMeshRun(run.id)));
}
