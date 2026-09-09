"use client";

import { useEffect, useState } from "react";

import { onBroadcast } from "@/features/telecom/lib/channel";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/lib/status-definitions";
import { normalizeColumnMapping, useTelecomStore } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

const TELECOM_UI_STORAGE_KEY = "telecom-session-v1";

interface PersistedTelecomUiState {
  columnMapping?: Partial<Types.ColumnMapping>;
  statusMapping?: Types.StatusMapping[];
}

function readPersistedUiState(): PersistedTelecomUiState {
  if (typeof localStorage === "undefined") return {};

  try {
    const raw = localStorage.getItem(TELECOM_UI_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as { state?: PersistedTelecomUiState };
    return parsed.state ?? {};
  } catch {
    return {};
  }
}

function writePersistedUiState(next: PersistedTelecomUiState) {
  if (typeof localStorage === "undefined") return;

  try {
    const current = readPersistedUiState();
    localStorage.setItem(
      TELECOM_UI_STORAGE_KEY,
      JSON.stringify({ state: { ...current, ...next }, version: 0 }),
    );
  } catch {}
}

export interface UseTelecomUIReturn {
  mounted: boolean;
  showMapper: boolean;
  setShowMapper: (v: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  installPrompt: Event | null;
  setInstallPrompt: (v: Event | null) => void;
  mapping: Types.ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<Types.ColumnMapping>>;
  statusMapping: Types.StatusMapping[];
  setStatusMapping: React.Dispatch<React.SetStateAction<Types.StatusMapping[]>>;
}

interface UseTelecomUIParams {
  defaultMapping: Types.ColumnMapping;
  fileNameRef: React.RefObject<string>;
}

export function useTelecomUI({
  defaultMapping,
  fileNameRef,
}: UseTelecomUIParams): UseTelecomUIReturn {
  const [mounted, setMounted] = useState(false);
  const [showMapper, setShowMapper] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [mapping, setMappingState] = useState<Types.ColumnMapping>(
    normalizeColumnMapping(defaultMapping),
  );

  const setMapping: React.Dispatch<React.SetStateAction<Types.ColumnMapping>> = (value) => {
    setMappingState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      return normalizeColumnMapping(next);
    });
  };
  const [statusMapping, setStatusMapping] = useState<Types.StatusMapping[]>([
    ...DEFAULT_STATUS_MAPPINGS,
  ]);

  // Mount + store hydration
  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate persisted UI state once after client mount
  useEffect(() => {
    setMounted(true);
    const persisted = readPersistedUiState();
    setMapping(normalizeColumnMapping(persisted.columnMapping ?? defaultMapping));
    if (persisted.statusMapping?.length) {
      setStatusMapping(persisted.statusMapping);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync writes back to localStorage without subscribing this provider to a store.
  useEffect(() => {
    const next = normalizeColumnMapping(mapping);
    writePersistedUiState({ columnMapping: next });
    useTelecomStore.getState().setColumnMapping(next);
  }, [mapping]);

  useEffect(() => {
    writePersistedUiState({ statusMapping });
    useTelecomStore.getState().setStatusMapping(statusMapping);
  }, [statusMapping]);

  // F2 — PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    globalThis.window.addEventListener("beforeinstallprompt", handler);
    return () => globalThis.window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // F10 — BroadcastChannel: listen for cross-tab file-loaded events
  useEffect(() => {
    const unsub = onBroadcast((msg) => {
      if (msg.type === "FILE_LOADED" && msg.fileName !== fileNameRef.current) {
        import("sonner").then(({ toast }) =>
          toast(`Fichier chargé dans un autre onglet: ${msg.fileName}`, {
            description: "Rechargez la page pour synchroniser.",
          }),
        );
      }
    });
    return unsub;
  }, [fileNameRef]);

  // F4 — Yjs cross-tab CRDT sync (filter + mapping)
  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe to the singleton Yjs maps once
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    import("@/platform/collab/collab").then(
      ({ startCollabSync: start, sharedMapping: yMapping }) => {
        cleanup = start();

        const mappingObs = () => {
          setMapping((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(prev) as (keyof Types.ColumnMapping)[]) {
              const v = yMapping.get(key);
              if (v !== undefined) (next as Record<string, string>)[key] = v;
            }
            return normalizeColumnMapping(next);
          });
        };
        yMapping.observe(mappingObs);

        const originalCleanup = cleanup;
        cleanup = () => {
          originalCleanup?.();
          yMapping.unobserve(mappingObs);
        };
      },
    );
    return () => cleanup?.();
  }, []);

  // F19 — ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return {
    mounted,
    showMapper,
    setShowMapper,
    commandOpen,
    setCommandOpen,
    installPrompt,
    setInstallPrompt,
    mapping,
    setMapping,
    statusMapping,
    setStatusMapping,
  };
}
