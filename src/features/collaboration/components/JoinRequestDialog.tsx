"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getActiveLANSettings,
  getLANStatus,
  readLANSettings,
  subscribeLAN,
} from "@/platform/lan/lan-collab";
import { GUEST_PERMISSIONS, type GuestPermission } from "@/platform/lan/lan-common";

interface PendingGuest {
  id: string;
  name: string;
  role: "viewer" | "editor" | "reviewer";
  requestedAt: number;
}

const POLL_INTERVAL_MS = 3000;
const ROLES = ["viewer", "editor", "reviewer"] as const;
type Role = (typeof ROLES)[number];

const PERMISSION_LABELS: Record<GuestPermission, { label: string; description: string }> = {
  viewReports: {
    label: "Voir les rapports",
    description: "Lire les analyses et tableaux de bord partagés",
  },
  uploadData: {
    label: "Importer des données",
    description: "Téléverser des fichiers CSV/Excel dans la session",
  },
  exportData: {
    label: "Exporter les données",
    description: "Télécharger les analyses et résultats en CSV/PNG",
  },
  editComments: {
    label: "Modifier les commentaires",
    description: "Ajouter, répondre et résoudre les annotations",
  },
  useAI: {
    label: "Utiliser l'IA (Moudir / Formulateur)",
    description: "Poser des questions en langage naturel et générer des visualisations",
  },
  manageUsers: {
    label: "Gérer les utilisateurs",
    description: "Inviter, révoquer ou changer le rôle d'autres invités",
  },
  accessSettings: {
    label: "Accéder aux paramètres",
    description: "Modifier la configuration, le thème et les préférences",
  },
};

const DEFAULT_PERMISSIONS_BY_ROLE: Record<Role, GuestPermission[]> = {
  reviewer: ["viewReports", "editComments"],
  viewer: ["viewReports"],
  editor: ["viewReports", "uploadData", "exportData", "editComments"],
};

function elapsedLabel(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function JoinRequestDialog() {
  const lanStatus = useSyncExternalStore(subscribeLAN, getLANStatus, () => "off" as const);
  const [guests, setGuests] = useState<PendingGuest[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, GuestPermission[]>>({});

  const isHostOrAdmin = (() => {
    const active = getActiveLANSettings();
    if (active) return active.peer.role === "host" || active.peer.role === "editor";
    try {
      const saved = readLANSettings();
      return saved.peer.role === "host" || saved.peer.role === "editor";
    } catch {
      return true;
    }
  })();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/guest/pending", { cache: "no-store" });
      if (!r.ok) {
        setError(`Status ${r.status}`);
        return;
      }
      const data = (await r.json()) as { guests?: PendingGuest[] };
      const list = data.guests ?? [];
      setGuests(list);
      setOpen(list.length > 0);
      setGrants((prev) => {
        const next: Record<string, GuestPermission[]> = { ...prev };
        for (const g of list) {
          if (!next[g.id]) next[g.id] = [...DEFAULT_PERMISSIONS_BY_ROLE[g.role]];
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }, []);

  useEffect(() => {
    if (!isHostOrAdmin || lanStatus !== "connected") {
      setGuests([]);
      setOpen(false);
      return;
    }

    let timerId: number | null = null;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void refresh();
    };

    tick();
    timerId = window.setInterval(tick, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isHostOrAdmin, lanStatus, refresh]);

  const approve = useCallback(
    async (id: string, role: Role) => {
      setPendingId(id);
      setError(null);
      try {
        const permissions = grants[id] ?? DEFAULT_PERMISSIONS_BY_ROLE[role];
        const r = await fetch("/api/guest/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, role, permissions }),
        });
        if (!r.ok) {
          setError(`Approve failed: ${r.status}`);
          return;
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setPendingId(null);
      }
    },
    [grants, refresh],
  );

  const deny = useCallback(
    async (id: string) => {
      setPendingId(id);
      setError(null);
      try {
        const r = await fetch("/api/guest/deny", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!r.ok) {
          setError(`Deny failed: ${r.status}`);
          return;
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setPendingId(null);
      }
    },
    [refresh],
  );

  const toggleGrant = useCallback((guestId: string, permission: GuestPermission) => {
    setGrants((prev) => {
      const current = prev[guestId] ?? [];
      const next = current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission];
      return { ...prev, [guestId]: next };
    });
  }, []);

  const selectAll = useCallback((guestId: string) => {
    setGrants((prev) => ({ ...prev, [guestId]: [...GUEST_PERMISSIONS] }));
  }, []);

  const selectNone = useCallback((guestId: string) => {
    setGrants((prev) => ({ ...prev, [guestId]: [] }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Guest join requests</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {guests.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              No pending requests.
            </div>
          ) : (
            guests.map((g) => {
              const busy = pendingId === g.id;
              const granted = grants[g.id] ?? DEFAULT_PERMISSIONS_BY_ROLE[g.role];
              return (
                <div key={g.id} className="rounded-lg border border-border bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">{g.name}</div>
                      <div className="text-xs text-muted-foreground">
                        waiting {elapsedLabel(g.requestedAt)} · wants {g.role}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ROLES.map((r) => (
                        <Button
                          key={r}
                          type="button"
                          size="sm"
                          variant={r === g.role ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => void approve(g.id, r)}
                        >
                          <Check className="size-3" /> {r}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void deny(g.id)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  </div>

                  <fieldset className="border-t border-border pt-2 space-y-1.5">
                    <legend className="text-xs font-semibold text-muted-foreground px-1">
                      Capabilities ({granted.length}/{GUEST_PERMISSIONS.length})
                    </legend>
                    <div className="flex items-center justify-end gap-1 text-xs">
                      <button
                        type="button"
                        className="text-primary hover:underline disabled:opacity-50"
                        onClick={() => selectAll(g.id)}
                        disabled={busy || granted.length === GUEST_PERMISSIONS.length}
                      >
                        Tout
                      </button>
                      <span className="text-muted-foreground/50">·</span>
                      <button
                        type="button"
                        className="text-primary hover:underline disabled:opacity-50"
                        onClick={() => selectNone(g.id)}
                        disabled={busy || granted.length === 0}
                      >
                        Aucun
                      </button>
                    </div>
                    <ul className="grid grid-cols-1 gap-1">
                      {GUEST_PERMISSIONS.map((permission) => {
                        const checked = granted.includes(permission);
                        const meta = PERMISSION_LABELS[permission];
                        return (
                          <li key={permission}>
                            <label
                              className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-accent/40 ${
                                busy ? "opacity-50" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 size-3.5 accent-primary"
                                checked={checked}
                                disabled={busy}
                                onChange={() => toggleGrant(g.id, permission)}
                                aria-describedby={`perm-desc-${g.id}-${permission}`}
                              />
                              <span className="flex-1 min-w-0">
                                <span className="font-medium text-foreground block">
                                  {meta.label}
                                </span>
                                <span
                                  id={`perm-desc-${g.id}-${permission}`}
                                  className="text-muted-foreground block"
                                >
                                  {meta.description}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                </div>
              );
            })
          )}
        </div>

        {error ? <div className="text-xs text-rose-600 dark:text-rose-400">{error}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
