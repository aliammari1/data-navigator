"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { onBroadcast } from "@/features/telecom/lib/channel";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/lib/status-definitions";
import {
  normalizeColumnMapping,
  useTelecomStore,
} from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

export interface UseTelecomUIReturn {
  mounted: boolean;
  activeTab: Types.MainTab;
  setActiveTab: (t: Types.MainTab) => void;
  switchTab: (t: Types.MainTab) => void;
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
  statusMappingRef: React.RefObject<Types.StatusMapping[]>;
}

interface UseTelecomUIParams {
  defaultMapping: Types.ColumnMapping;
  fileNameRef: React.RefObject<string>;
}

export function useTelecomUI({
  defaultMapping,
  fileNameRef,
}: UseTelecomUIParams): UseTelecomUIReturn {
  const storeSetActiveTab = useTelecomStore((s) => s.setActiveTab);
  const storeSetMapping = useTelecomStore((s) => s.setColumnMapping);
  const storeSetStatusMapping = useTelecomStore((s) => s.setStatusMapping);

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Types.MainTab>(
    () => useTelecomStore.getState().activeTab || "overview",
  );
  const [showMapper, setShowMapper] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [mapping, setMappingState] = useState<Types.ColumnMapping>(
    normalizeColumnMapping(defaultMapping),
  );

  const setMapping: React.Dispatch<
    React.SetStateAction<Types.ColumnMapping>
  > = (value) => {
    setMappingState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      return normalizeColumnMapping(next);
    });
  };
  const [statusMapping, setStatusMapping] = useState<Types.StatusMapping[]>([
    ...DEFAULT_STATUS_MAPPINGS,
  ]);

  // Ref always mirrors statusMapping so analytics callback can read latest value
  const statusMappingRef: React.RefObject<Types.StatusMapping[]> = {
    current: statusMapping,
  };
  statusMappingRef.current = statusMapping;

  // Mount + store hydration
  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate persisted UI state once after client mount
  useEffect(() => {
    setMounted(true);
    const s = useTelecomStore.getState();
    if (s.activeTab && s.activeTab !== "overview")
      setActiveTab(s.activeTab as Types.MainTab);
    setMapping(normalizeColumnMapping(s.columnMapping ?? defaultMapping));
    if (s.statusMapping?.length)
      setStatusMapping(s.statusMapping as Types.StatusMapping[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync writes back to Zustand store
  useEffect(() => {
    storeSetActiveTab(activeTab);
  }, [activeTab, storeSetActiveTab]);

  useEffect(() => {
    storeSetMapping(normalizeColumnMapping(mapping));
  }, [mapping, storeSetMapping]);

  useEffect(() => {
    storeSetStatusMapping(
      statusMapping as Parameters<typeof storeSetStatusMapping>[0],
    );
  }, [statusMapping, storeSetStatusMapping]);

  // F2 — PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
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

  // F4 — Yjs cross-tab CRDT sync (filter + tab + mapping)
  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe to the singleton Yjs maps once
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    import("@/platform/collab/collab").then(
      ({
        startCollabSync: start,
        sharedTab: yTab,
        sharedMapping: yMapping,
      }) => {
        cleanup = start();

        const tabObs = () => {
          const t = yTab.get("active") as Types.MainTab | undefined;
          if (t === "overview") setActiveTab(t);
        };
        yTab.observe(tabObs);

        const mappingObs = () => {
          setMapping((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(
              prev,
            ) as (keyof Types.ColumnMapping)[]) {
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
          yTab.unobserve(tabObs);
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

  const switchTab = useCallback((next: Types.MainTab) => {
    if (next === "overview") {
      import("@/platform/collab/collab").then(({ sharedTab: yTab, ydoc }) => {
        ydoc.transact(() => yTab.set("active", next));
      });
    }
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      (
        document as Document & { startViewTransition(cb: () => void): void }
      ).startViewTransition(() => flushSync(() => setActiveTab(next)));
    } else {
      setActiveTab(next);
    }
  }, []);

  // Same-page shell sidebar clicks should follow the same path as the telecom
  // page's internal sidebar.
  useEffect(() => {
    const handler = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: Types.MainTab }>).detail?.tab;
      if (tab) switchTab(tab);
    };

    window.addEventListener("telecom:select-tab", handler);
    return () => window.removeEventListener("telecom:select-tab", handler);
  }, [switchTab]);

  // Sync external store changes (e.g. cross-route nav-sidebar clicks) to local state
  useEffect(() => {
    const unsub = useTelecomStore.subscribe(
      (s) => s.activeTab,
      (tab) => {
        if (
          typeof document !== "undefined" &&
          "startViewTransition" in document
        ) {
          (
            document as Document & { startViewTransition(cb: () => void): void }
          ).startViewTransition(() =>
            flushSync(() => setActiveTab(tab as Types.MainTab)),
          );
        } else {
          setActiveTab(tab as Types.MainTab);
        }
      },
    );
    return unsub;
  }, []);

  return {
    mounted,
    activeTab,
    setActiveTab,
    switchTab,
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
    statusMappingRef,
  };
}
