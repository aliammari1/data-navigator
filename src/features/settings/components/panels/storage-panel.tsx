"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ensurePersistentStorage, type OPFS_NS } from "@/platform/storage";
import { downloadSettingsBackup, restoreSettingsFromFile } from "../../lib/settings-backup";
import { formatBytes } from "../../lib/format";
import { clearCacheNamespace, readStorageStats, type StorageStats } from "../../lib/storage-stats";
import { QuotaBar, Section, SettingRow } from "../controls";

export function StoragePanel() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<keyof typeof OPFS_NS | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // ensurePersistentStorage is idempotent — also pins the origin so the OS
      // won't silently evict our IndexedDB/OPFS caches under pressure.
      await ensurePersistentStorage();
      setStats(await readStorageStats());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClear = useCallback(async (id: keyof typeof OPFS_NS, label: string) => {
    setClearing(id);
    try {
      await clearCacheNamespace(id);
      toast.success(`Cleared ${label.toLowerCase()} cache`);
      setStats(await readStorageStats());
    } catch {
      toast.error(`Failed to clear ${label.toLowerCase()} cache`);
    } finally {
      setClearing(null);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      await downloadSettingsBackup();
      toast.success("Settings backed up");
    } catch {
      toast.error("Could not create backup");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const result = await restoreSettingsFromFile(file);
      if (result.ok) {
        toast.success("Settings restored", {
          description: `${result.restoredKeys} key(s) imported.`,
        });
      } else {
        toast.error("Restore failed", { description: result.error });
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const overall = stats?.overall;

  return (
    <>
      <Section title="Device Storage" icon={HardDrive}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Used</span>
            <span className="text-foreground tabular-nums">
              {loading || !overall
                ? "…"
                : `${formatBytes(overall.usedMB * 1024 * 1024)} / ${formatBytes(
                    overall.quotaMB * 1024 * 1024,
                  )}`}
            </span>
          </div>
          <QuotaBar pct={overall?.pct ?? 0} />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck
                className={overall?.isPersistent ? "w-3.5 h-3.5 text-emerald-400" : "w-3.5 h-3.5"}
              />
              {overall?.isPersistent
                ? "Storage is persisted (eviction-protected)"
                : overall?.supported === false
                  ? "Storage API unavailable in this context"
                  : "Storage not yet persisted"}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Cached Models & Data" icon={Database}>
        {stats && !stats.opfsAvailable ? (
          <p className="text-xs text-muted-foreground">
            On-device caches (OPFS) are not available in this context.
          </p>
        ) : (
          <div className="space-y-3">
            {(stats?.caches ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{c.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.description}</div>
                </div>
                <div className="flex items-center gap-3 flex-none">
                  <span className="text-sm text-foreground tabular-nums w-16 text-right">
                    {loading ? "…" : formatBytes(c.bytes)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={c.bytes === 0 || clearing === c.id}
                    onClick={() => void handleClear(c.id, c.label)}
                    aria-label={`Clear ${c.label} cache`}
                  >
                    {clearing === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Clear
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Backup & Restore" icon={Download}>
        <SettingRow
          label="Settings backup"
          description="Export every preference as an offline JSON file, or restore from one"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void handleExport()}
            >
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // allow re-selecting the same file
                if (file) void handleImport(file);
              }}
            />
          </div>
        </SettingRow>
      </Section>
    </>
  );
}
