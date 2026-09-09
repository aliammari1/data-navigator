"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { readLANSettings, saveLANSettings } from "@/platform/lan/lan-collab";
import { createDrizzleStorage, createSelectors, durablePersist } from "@/platform/storage";

// ─── Types (UI-only local prefs) ──────────────────────────────────────────────
//
// Collaborative state (annotations, approvals, audit, presence) now lives in the
// platform Yjs doc (`@/platform/collab`) so it merges across tabs + LAN peers and
// survives reload via y-indexeddb. This store keeps ONLY local UI preferences
// that have no business syncing: the display name, last-used note styling, the
// list of locally-shared report links, and the bound LAN session code.

type NoteColor = "yellow" | "blue" | "green" | "pink" | "purple";
type NotePriority = "normal" | "important" | "urgent";

interface SharedReport {
  id: string;
  name: string;
  approvedBy: string;
  approvedAt: number;
  url: string;
}

type CollabHubState = {
  /** Local display name (mirrored to the LAN peer identity + `collab:username`). */
  username: string;
  /** Last note color/priority chosen, so the sticky-note form remembers it. */
  lastNoteColor: NoteColor;
  lastNotePriority: NotePriority;
  /** Locally-tracked shared report links (a convenience list, not collab state). */
  sharedReports: SharedReport[];
  /** The bound LAN room + pairing code teammates enter to join. */
  sessionCode: string | null;

  setUsername: (name: string) => void;
  setLastNoteStyle: (color: NoteColor, priority: NotePriority) => void;
  shareReport: (report: SharedReport) => void;
  /**
   * Binds the collaboration "session code" to the real LAN room + pairing code
   * managed by `@/platform/lan/lan-collab` (what teammates actually enter to
   * join), instead of a cosmetic random string. Returns null when no LAN
   * identity is configured yet.
   */
  refreshSessionCode: () => string | null;
};

function readInitialUsername(): string {
  if (typeof window === "undefined") return "You";
  const override = localStorage.getItem("collab:username");
  if (override) return override;
  try {
    return readLANSettings().peer.name || "You";
  } catch {
    return "You";
  }
}

function getDefaults(): Pick<
  CollabHubState,
  "username" | "lastNoteColor" | "lastNotePriority" | "sharedReports" | "sessionCode"
> {
  return {
    username: "You",
    lastNoteColor: "yellow",
    lastNotePriority: "normal",
    sharedReports: [],
    sessionCode: null,
  };
}

const useCollabHubStoreBase = create<CollabHubState>()(
  persist(
    (set) => ({
      ...getDefaults(),
      username: readInitialUsername(),

      setUsername: (name) => {
        if (typeof window !== "undefined") {
          // Keep the shared identity key in sync so audit/annotations/presence
          // all read the same display name.
          localStorage.setItem("collab:username", name);
          try {
            const settings = readLANSettings();
            if (settings.peer.name !== name) {
              saveLANSettings({
                ...settings,
                peer: { ...settings.peer, name },
              });
            }
          } catch {
            // LAN settings unavailable (SSR) — username still set below.
          }
        }
        set({ username: name });
      },

      setLastNoteStyle: (color, priority) =>
        set({ lastNoteColor: color, lastNotePriority: priority }),

      shareReport: (report) =>
        set((s) => ({
          sharedReports: [report, ...s.sharedReports.filter((r) => r.id !== report.id)].slice(
            0,
            50,
          ),
        })),

      refreshSessionCode: () => {
        if (typeof window === "undefined") return null;
        const { room, pairingCode } = readLANSettings();
        // A real, joinable session is identified by the LAN room and (when
        // pairing is enforced) its pairing code — the values a teammate enters
        // in the LAN control center to connect.
        const code = pairingCode ? `${room} · ${pairingCode}` : room;
        const next = code || null;
        set({ sessionCode: next });
        return next;
      },
    }),
    {
      ...durablePersist<CollabHubState>({
        name: "collab-hub-store",
        version: 2,
        getDefaults: () => ({ ...getDefaults() }) as CollabHubState,
        persistKeys: [
          "username",
          "lastNoteColor",
          "lastNotePriority",
          "sharedReports",
          "sessionCode",
        ],
      }),
      // Durable in drizzle (namespace "settings") with a synchronous localStorage
      // working copy, so these UI prefs survive a profile wipe and ride along in
      // settings backup/restore. The `collab:username` + LAN-settings side-channels
      // (setUsername / readLANSettings) are intentionally left on their own
      // transports — audit/annotations/presence read them directly.
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "settings" })),
    },
  ),
);

/**
 * Selector-disciplined hook: use `useCollabHubStore.use.field()` for single
 * fields (never the bare hook) so components subscribe narrowly.
 */
export const useCollabHubStore = createSelectors(useCollabHubStoreBase);
