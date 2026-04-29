"use client";

import { useCallback, useEffect, useState } from "react";
import { onBroadcast } from "@/features/telecom/lib/channel";
import { useTelecomStore } from "@/features/telecom/store";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/constants";
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
  /** Mapping state owned here; synced to/from Zustand store */
  mapping: Types.ColumnMapping;
  setMapping: React.Dispatch<React.SetStateAction<Types.ColumnMapping>>;
  statusMapping: Types.StatusMapping[];
  setStatusMapping: React.Dispatch<React.SetStateAction<Types.StatusMapping[]>>;
  statusMappingRef: React.MutableRefObject<Types.StatusMapping[]>;
}

interface UseTelecomUIParams {
  defaultMapping: Types.ColumnMapping;
  storeHydrated: boolean;
  fileNameRef: React.MutableRefObject<string>;
}

export function useTelecomUI({
  defaultMapping,
  storeHydrated,
  fileNameRef,
}: UseTelecomUIParams): UseTelecomUIReturn {
  const storeSetActiveTab = useTelecomStore((s) => s.setActiveTab);
  const storeSetMapping = useTelecomStore((s) => s.setColumnMapping);
  const storeSetStatusMapping = useTelecomStore((s) => s.setStatusMapping);

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Types.MainTab>("overview");
  const [showMapper, setShowMapper] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [mapping, setMapping] = useState<Types.ColumnMapping>({ ...defaultMapping });
  const [statusMapping, setStatusMapping] = useState<Types.StatusMapping[]>([
    ...DEFAULT_STATUS_MAPPINGS,
  ]);

  // Ref always mirrors statusMapping so analytics callback can read latest value
  const statusMappingRef: React.MutableRefObject<Types.StatusMapping[]> = {
    current: statusMapping,
  };
  statusMappingRef.current = statusMapping;

  // Mount + store hydration
  useEffect(() => {
    setMounted(true);
    const s = useTelecomStore.getState();
    if (s.activeTab && s.activeTab !== "overview")
      setActiveTab(s.activeTab as Types.MainTab);
    if (s.columnMapping)
      setMapping({ ...defaultMapping, ...(s.columnMapping as Types.ColumnMapping) });
    if (s.statusMapping?.length)
      setStatusMapping(s.statusMapping as Types.StatusMapping[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync writes back to Zustand store
  useEffect(() => {
    if (!storeHydrated) return;
    storeSetActiveTab(activeTab);
  }, [activeTab, storeHydrated, storeSetActiveTab]);

  useEffect(() => {
    if (!storeHydrated) return;
    storeSetMapping(mapping as Parameters<typeof storeSetMapping>[0]);
  }, [mapping, storeHydrated, storeSetMapping]);

  useEffect(() => {
    if (!storeHydrated) return;
    storeSetStatusMapping(statusMapping as Parameters<typeof storeSetStatusMapping>[0]);
  }, [statusMapping, storeHydrated, storeSetStatusMapping]);

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
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    import("@/lib/collab").then(
      ({ startCollabSync: start, sharedTab: yTab, sharedMapping: yMapping }) => {
        cleanup = start();

        const tabObs = () => {
          const t = yTab.get("active") as Types.MainTab | undefined;
          if (t) setActiveTab(t);
        };
        yTab.observe(tabObs);

        const mappingObs = () => {
          setMapping((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(prev) as (keyof Types.ColumnMapping)[]) {
              const v = yMapping.get(key);
              if (v !== undefined) (next as Record<string, string>)[key] = v;
            }
            return next;
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

  // F16 — View Transitions + F4 Yjs broadcast on tab switch
  const switchTab = useCallback((next: Types.MainTab) => {
    import("@/lib/collab").then(({ sharedTab: yTab, ydoc }) => {
      ydoc.transact(() => yTab.set("active", next));
    });
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      (document as Document & { startViewTransition(cb: () => void): void })
        .startViewTransition(() => setActiveTab(next));
    } else {
      setActiveTab(next);
    }
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
