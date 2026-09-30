"use client";

import { Database, Eye, Info } from "lucide-react";
import { useState } from "react";
import { useRuntimeMode } from "@/platform/runtime-mode";
import { Section } from "../controls";

export function AboutPanel() {
  const online = useRuntimeMode((s) => s.mode === "online");
  const [update, setUpdate] = useState<{
    currentVersion: string;
    latestVersion: string;
    available: boolean;
    releaseUrl: string;
  } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const runtime =
    typeof window === "undefined"
      ? undefined
      : (
          window as Window & {
            electronRuntime?: {
              checkForUpdates: () => Promise<{
                currentVersion: string;
                latestVersion: string;
                available: boolean;
                releaseUrl: string;
              }>;
              openUpdate: (url: string) => Promise<void>;
            };
          }
        ).electronRuntime;

  const checkForUpdates = async () => {
    if (!runtime) return;
    setChecking(true);
    setUpdateError(null);
    try {
      setUpdate(await runtime.checkForUpdates());
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Could not check for updates.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Section title="About DataNavigator" icon={Info}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-primary to-violet-600 flex items-center justify-center">
              <Database className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">DataNavigator</div>
              <div className="text-sm text-muted-foreground">offline-first data workspace</div>
            </div>
          </div>
        </div>
      </Section>

      {online && runtime && (
        <Section title="App updates" icon={Info}>
          <div className="space-y-3 text-sm">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={checking}
              className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            >
              {checking ? "Checking…" : "Check for updates"}
            </button>
            {updateError && (
              <p role="alert" className="text-destructive">
                {updateError}
              </p>
            )}
            {update && (
              <div className="space-y-2">
                <p>
                  {update.available
                    ? `Version ${update.latestVersion} is available (installed: ${update.currentVersion}).`
                    : `You have the latest version (${update.currentVersion}).`}
                </p>
                {update.available && (
                  <button
                    type="button"
                    onClick={() => void runtime.openUpdate(update.releaseUrl)}
                    className="text-primary underline"
                  >
                    Open download page
                  </button>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Privacy & Data" icon={Eye}>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Local by default</strong> - data stays on this
            device. Online mode enables LAN collaboration and manual update checks.
          </p>
          <p>
            <strong className="text-foreground">DuckDB</strong> runs locally (native on desktop,
            WebAssembly on the web build) and never uploads your data.
          </p>
          <p>
            <strong className="text-foreground">AI features</strong> use local algorithms and models
            cached on-device — your data never leaves the machine.
          </p>
          <p>
            <strong className="text-foreground">Settings</strong> are persisted durably in a local
            SQLite table and mirrored to localStorage for instant load. Use the Storage panel to
            back them up.
          </p>
        </div>
      </Section>
    </>
  );
}
