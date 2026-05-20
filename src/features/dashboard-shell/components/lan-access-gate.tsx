"use client";

import { KeyRound, Loader2, Radio, RefreshCw, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  connectLAN,
  disconnectLAN,
  getLANStatus,
  type LANScanResult,
  readLANSettings,
  saveLANSettings,
  scanLANSubnet,
  subscribeLAN,
} from "@/platform/lan/lan-collab";

function randomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function LanAccessGate({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const [stableConnected, setStableConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState(() => readLANSettings());
  const [mode, setMode] = useState<"user" | "admin">("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanResults, setScanResults] = useState<LANScanResult[]>([]);
  const scanningRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      subscribeLAN(() => {
        const next = getLANStatus();
        if (next === "connected") {
          setStableConnected(true);
          setConnecting(false);
        } else {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(
            () => setStableConnected(false),
            800,
          );
        }
      }),
    [],
  );

  if (isAdmin) return <>{children}</>;

  if (stableConnected === null) {
    return <>{children}</>;
  }

  if (stableConnected) return <>{children}</>;

  if (connecting) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-900/30">
            <Loader2 className="h-7 w-7 animate-spin text-cyan-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Connecting…</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Waiting for the server. Make sure the terminal command is running.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              disconnectLAN();
              setConnecting(false);
              setError("");
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const persist = (patch: Partial<typeof settings>) => {
    const next = {
      ...settings,
      ...patch,
      peer: { ...settings.peer, ...(patch.peer ?? {}) },
    };
    setSettings(next);
    saveLANSettings(next);
  };

  const connect = async (role: "host" | "viewer") => {
    setError("");
    setConnecting(true);
    try {
      await connectLAN({ ...settings, peer: { ...settings.peer, role } });
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setConnecting(false);
    }
  };

  const autoFind = async () => {
    if (scanningRef.current || !settings.url) return;
    scanningRef.current = true;
    setBusy(true);
    setError("");
    try {
      const results = await scanLANSubnet({ sampleUrl: settings.url });
      setScanResults(results);
      if (results[0]?.url) persist({ url: results[0].url });
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      scanningRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-900/30">
            <Radio className="h-7 w-7 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Access required
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "user"
                ? "Enter the code your admin gave you to access this dashboard."
                : "Start a session to open this dashboard for your team."}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {/* ── USER: enter access code ── */}
          {mode === "user" && (
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Server address
                </span>
                <div className="flex gap-2">
                  <input
                    value={settings.url}
                    onChange={(e) => persist({ url: e.target.value })}
                    placeholder="ws://192.168.1.10:1234"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={autoFind}
                    disabled={!settings.url || busy}
                    title="Auto-find on local network"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {scanResults.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {scanResults.map((r) => (
                      <button
                        key={r.url}
                        type="button"
                        onClick={() => persist({ url: r.url })}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
                      >
                        {r.url}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Room name
                </span>
                <input
                  value={settings.room}
                  onChange={(e) => persist({ room: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Access code
                </span>
                <input
                  value={settings.pairingCode}
                  onChange={(e) => persist({ pairingCode: e.target.value })}
                  placeholder="••••••"
                  className="h-14 w-full rounded-lg border border-border bg-background px-3 text-center font-mono text-2xl tracking-[0.4em]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Your name
                </span>
                <input
                  value={settings.peer.name}
                  onChange={(e) =>
                    persist({
                      peer: { ...settings.peer, name: e.target.value },
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={() => connect("viewer")}
                disabled={!settings.url || !settings.pairingCode}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                Enter dashboard
              </button>
            </div>
          )}

          {/* ── ADMIN: start session ── */}
          {mode === "admin" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted px-3 py-3 text-xs">
                <p className="font-medium text-foreground">
                  Step 1 — run this in a terminal:
                </p>
                <code className="mt-1.5 block truncate font-mono text-muted-foreground">
                  PAIRING_CODE={settings.pairingCode || "123456"} PORT=1234 bun
                  run lan-server
                </code>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Server address
                </span>
                <input
                  value={settings.url}
                  onChange={(e) => persist({ url: e.target.value })}
                  placeholder="ws://192.168.1.10:1234"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Access code — share this with users
                </span>
                <div className="flex gap-2">
                  <input
                    value={settings.pairingCode}
                    onChange={(e) => persist({ pairingCode: e.target.value })}
                    className="h-14 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-center font-mono text-2xl tracking-[0.4em]"
                  />
                  <button
                    type="button"
                    onClick={() => persist({ pairingCode: randomCode() })}
                    title="Generate new code"
                    className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </label>

              <button
                type="button"
                onClick={() => connect("host")}
                disabled={!settings.url || !settings.pairingCode}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                Open dashboard
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {mode === "user" ? (
            <>
              Are you the admin?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("admin");
                  setError("");
                }}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Start a session instead
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("user");
                setError("");
              }}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              ← I have an access code
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
