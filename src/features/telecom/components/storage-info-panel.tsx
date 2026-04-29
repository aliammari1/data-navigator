"use client";
import { Database } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Section } from "./section";

export function StorageInfoPanel({ tableName }: { tableName: string }) {
  const [info, setInfo] = useState<
    import("@/lib/storage-info").StorageInfo | null
  >(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    import("@/lib/storage-info").then(({ getStorageInfo }) =>
      getStorageInfo().then(setInfo),
    );
  }, []);

  async function handlePersist() {
    setRequesting(true);
    const { requestPersistence, getStorageInfo } =
      await import("@/lib/storage-info");
    await requestPersistence();
    setInfo(await getStorageInfo());
    setRequesting(false);
  }

  async function handleClearOPFS() {
    const { clearOPFSDatabase } = await import("@/lib/duckdb-opfs");
    await clearOPFSDatabase(tableName);
    const { getStorageInfo } = await import("@/lib/storage-info");
    setInfo(await getStorageInfo());
    toast.success("Cache OPFS vidé");
  }

  if (!info) return null;
  if (!info.supported)
    return (
      <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        Storage API non disponible dans ce navigateur.
      </div>
    );

  return (
    <Section
      title="Stockage Navigateur"
      icon={<Database className="w-4 h-4" />}
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Espace utilisé</span>
            <span className="text-foreground font-semibold">
              {info.usedMB.toFixed(1)} MB / {info.quotaMB.toFixed(0)} MB
              <span className="text-muted-foreground ml-1">
                ({info.pct.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                info.pct > 80
                  ? "bg-red-500"
                  : info.pct > 50
                    ? "bg-amber-500"
                    : "bg-indigo-500",
              )}
              style={{ width: `${Math.min(info.pct, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-foreground">
              Stockage persistant
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {info.isPersistent
                ? "Données protégées contre l'éviction du navigateur"
                : "Stockage best-effort — peut être effacé sous pression mémoire"}
            </div>
          </div>
          {info.isPersistent ? (
            <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300 font-semibold">
              Persistant
            </span>
          ) : (
            <button
              type="button"
              onClick={handlePersist}
              disabled={requesting}
              className="text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/25 transition-colors font-semibold disabled:opacity-50"
            >
              {requesting ? "Demande…" : "Activer"}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <div className="text-xs font-semibold text-foreground">
              Cache OPFS
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Fichiers Parquet + base DuckDB persistée
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearOPFS}
            className="text-[10px] px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/25 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
          >
            Effacer le cache
          </button>
        </div>
      </div>
    </Section>
  );
}
