"use client";

import {
  CheckCircle,
  ChevronDown,
  Copy,
  KeyRound,
  Loader2,
  Power,
  Radio,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";
import {
  buildLANCommand,
  connectLAN,
  disconnectLAN,
  getInAppHubStatus,
  getLANAuthError,
  getLANPeers,
  getLANStatus,
  hasCollabHubBridge,
  type LANPeer,
  type LANRole,
  type LANScanResult,
  makeJoinHttpUrl,
  readLANSettings,
  saveLANSettings,
  scanLANSubnet,
  startInAppHub,
  stopInAppHub,
  subscribeHubDiscovery,
  subscribeLAN,
} from "@/platform/lan/lan-collab";
import { generatePairingCode } from "@/platform/lan/pairing";

export function LanControlCenter() {
  const router = useRouter();
  const [mode, setMode] = useState<"host" | "join">("host");
  const [settings, setSettings] = useState(() => readLANSettings());
  const [status, setStatus] = useState(getLANStatus());
  const [peers, setPeers] = useState<LANPeer[]>(getLANPeers());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [scanResults, setScanResults] = useState<LANScanResult[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // View-only guest code of the in-app hub (Electron) — shown next to the full
  // access code so hosts can hand guests a code that can never grant writes.
  const [guestCode, setGuestCode] = useState("");
  // Whether the embedded Electron-main hub is currently running/advertising.
  // Independent of `connected` (the renderer's own websocket client) — the
  // hub keeps broadcasting over mDNS even after this device disconnects its
  // own client, so "Stop hosting" must track the hub's lifecycle, not ours.
  const [hubRunning, setHubRunning] = useState(false);
  const scanRef = useRef(false);

  useEffect(() => {
    return subscribeLAN(() => {
      const next = getLANStatus();
      setStatus(next);
      setPeers(getLANPeers());
      // Surface async auth rejections (wrong code, guests disabled).
      if (next === "error") {
        const reason = getLANAuthError();
        if (reason) setError(reason);
      }
    });
  }, []);

  // Sync hub-running state on mount: this panel can unmount/remount (e.g. a
  // popover toggled closed/open) while the in-app hub keeps running in the
  // Electron main process, so local state alone would go stale.
  useEffect(() => {
    if (!hasCollabHubBridge()) return;
    let cancelled = false;
    getInAppHubStatus().then((st) => {
      if (!cancelled && st?.running) setHubRunning(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live mDNS discovery: merge push up/down events into the discovered-hub
  // list instead of relying solely on the one-shot scanLANSubnet/discoverHubs
  // snapshot, which can race ahead of mDNS responses on the very first call
  // and come back empty. This subscription naturally backfills that gap a
  // moment later once the "up" events arrive, so no extra retry is needed.
  useEffect(() => {
    return subscribeHubDiscovery(({ type, hub }) => {
      setScanResults((prev) => {
        if (type === "down") {
          return prev.filter((r) => r.url !== hub.url);
        }
        if (prev.some((r) => r.url === hub.url)) {
          return prev.map((r) => (r.url === hub.url ? { ...r, status: "found" as const } : r));
        }
        return [...prev, { url: hub.url, status: "found" as const }];
      });
    });
  }, []);

  // Generate the signed join URL asynchronously whenever settings change.
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    if (!settings.url) {
      setJoinUrl("");
      return;
    }
    let cancelled = false;
    makeJoinHttpUrl(settings)
      .then((url) => {
        if (!cancelled) setJoinUrl(url);
      })
      .catch(() => {
        if (!cancelled) setJoinUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(joinUrl, { width: 180, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [joinUrl]);

  const persist = (patch: Partial<typeof settings>) => {
    const next = {
      ...settings,
      ...patch,
      peer: { ...settings.peer, ...(patch.peer ?? {}) },
    };
    setSettings(next);
    saveLANSettings(next);
    // Keep the app-wide display name (Settings > Account, PresenceBar) in sync
    // when it's changed from here instead of there.
    if (patch.peer?.name && patch.peer.name !== settings.peer.name) {
      useCollabHubStore.getState().setUsername(patch.peer.name);
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const autoFind = async () => {
    if (scanRef.current || !settings.url) return;
    scanRef.current = true;
    await run(async () => {
      const results = await scanLANSubnet({ sampleUrl: settings.url });
      setScanResults(results);
      if (results[0]?.url) persist({ url: results[0].url });
    });
    scanRef.current = false;
  };

  const connected = status === "connected";
  const serverCommand = buildLANCommand(settings);
  const canStartInAppHub = hasCollabHubBridge();

  // One-click host path (Electron): boot the embedded Hocuspocus hub in the
  // main process — no separate terminal — then connect to it as host.
  const startHubAndConnect = () =>
    run(async () => {
      const hub = await startInAppHub({
        pairingCode: settings.pairingCode || undefined,
        room: settings.room,
      });
      if (!hub) throw new Error("Built-in hub unavailable");
      setGuestCode(hub.guestCode);
      setHubRunning(true);
      const next = {
        ...settings,
        url: hub.url,
        pairingCode: hub.pairingCode,
        room: hub.room,
        peer: { ...settings.peer, role: "host" as LANRole },
      };
      setSettings(next);
      saveLANSettings(next);
      await connectLAN(next);
    });

  // Tear down the embedded hub + mDNS advertisement itself (not just this
  // device's own websocket connection to it) — "End session" alone leaves the
  // hub running and still broadcasting for other peers to find.
  const stopHosting = () =>
    run(async () => {
      await stopInAppHub();
      await disconnectLAN();
      setHubRunning(false);
      setGuestCode("");
    });

  return (
    <div className="w-[min(480px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Radio className="h-4 w-4 text-cyan-500" />
        <span className="text-sm font-semibold">Share with nearby devices</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px]">
          {connected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-600 font-medium">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Offline</span>
            </>
          )}
        </span>
      </div>

      {/* Mode tabs */}
      {!connected && (
        <div className="flex border-b border-border">
          {(["host", "join"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${mode === m ? "border-b-2 border-cyan-500 text-cyan-600" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "host" ? "Start a session" : "Join a session"}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* ── HOST mode ── */}
        {(mode === "host" || connected) && (
          <>
            {/* Step 1: run server */}
            {!connected && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">
                    1
                  </span>
                  Start the server on this computer
                </div>
                {canStartInAppHub && (
                  <button
                    type="button"
                    onClick={startHubAndConnect}
                    disabled={busy}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Radio className="h-3.5 w-3.5" />
                    )}
                    Start built-in hub (no terminal needed)
                  </button>
                )}
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                    {serverCommand}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(serverCommand)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {canStartInAppHub
                    ? "Or open a terminal and run this command, then come back here."
                    : "Open a terminal and run this command, then come back here."}
                </p>
              </div>
            )}

            {/* Step 2: settings */}
            {!connected && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">
                    2
                  </span>
                  Configure your session
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="mb-1 block text-[10px] text-muted-foreground">
                      Server address
                    </span>
                    <input
                      value={settings.url}
                      onChange={(e) => persist({ url: e.target.value })}
                      placeholder="ws://192.168.1.10:1234"
                      className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] text-muted-foreground">Room name</span>
                    <input
                      value={settings.room}
                      onChange={(e) => persist({ room: e.target.value })}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] text-muted-foreground">
                      Access code
                    </span>
                    <div className="flex gap-1">
                      <input
                        value={settings.pairingCode}
                        onChange={(e) => persist({ pairingCode: e.target.value })}
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => persist({ pairingCode: generatePairingCode() })}
                        title="Generate new code"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    </div>
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] text-muted-foreground">Your name</span>
                    <input
                      value={settings.peer.name}
                      onChange={(e) =>
                        persist({
                          peer: { ...settings.peer, name: e.target.value },
                        })
                      }
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Step 3: QR / share */}
            {qrDataUrl && (
              <div className="space-y-1.5">
                {!connected && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">
                      3
                    </span>
                    Share this QR — others scan to join
                  </div>
                )}
                {connected && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" /> Session active — share QR to invite
                  </div>
                )}
                <div className="flex gap-4 items-start">
                  <Image
                    src={qrDataUrl}
                    alt="Join QR"
                    width={180}
                    height={180}
                    className="rounded-lg border border-border"
                  />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground">Room</div>
                      <div className="text-xs font-medium">{settings.room}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground">
                        Access code (can edit)
                      </div>
                      <div className="font-mono text-sm font-bold tracking-widest">
                        {settings.pairingCode}
                      </div>
                    </div>
                    {guestCode && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-muted-foreground">
                          Guest code (view-only)
                        </div>
                        <div className="font-mono text-sm font-bold tracking-widest text-muted-foreground">
                          {guestCode}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => copyText(joinUrl)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-muted"
                    >
                      {copied ? (
                        <CheckCircle className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Copy link
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Peers */}
            {connected && peers.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5" /> {peers.length} connected
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {peers.map((peer) => {
                    const canJump = Boolean(peer.page?.startsWith("/dashboard"));
                    return (
                      <button
                        key={peer.id}
                        type="button"
                        disabled={!canJump}
                        onClick={() => {
                          if (peer.page) router.push(peer.page);
                        }}
                        title={canJump ? `Go to ${peer.name}'s page (${peer.page})` : undefined}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] enabled:cursor-pointer enabled:hover:bg-muted"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: peer.color }} />
                        {peer.name}
                        <span className="text-muted-foreground">· {peer.role}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {connected ? (
                <button
                  type="button"
                  onClick={() => run(disconnectLAN)}
                  disabled={busy}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  <WifiOff className="h-4 w-4" /> End session
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => run(() => connectLAN(settings))}
                  disabled={!settings.url || !settings.pairingCode || busy}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Start & connect
                </button>
              )}
              {hubRunning && (
                <button
                  type="button"
                  onClick={stopHosting}
                  disabled={busy}
                  title="Stop the built-in hub so it no longer advertises on the network"
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  Stop hosting
                </button>
              )}
            </div>
          </>
        )}

        {/* ── JOIN mode ── */}
        {mode === "join" && !connected && (
          <>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ask the host for the QR code or the join link, then fill in below.
              </p>
              <label className="block">
                <span className="mb-1 block text-[10px] text-muted-foreground">
                  Server address (from host)
                </span>
                <div className="flex gap-1">
                  <input
                    value={settings.url}
                    onChange={(e) => persist({ url: e.target.value })}
                    placeholder="ws://192.168.1.10:1234"
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={autoFind}
                    disabled={!settings.url || busy}
                    title="Auto-find host on network"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wifi className="h-3 w-3" />
                    )}
                    Find
                  </button>
                </div>
                {scanResults.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {scanResults.map((r) => (
                      <button
                        key={r.url}
                        type="button"
                        onClick={() => persist({ url: r.url })}
                        className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 hover:bg-emerald-100"
                      >
                        {r.url}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block text-[10px] text-muted-foreground">Room name</span>
                  <input
                    value={settings.room}
                    onChange={(e) => persist({ room: e.target.value })}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] text-muted-foreground">Access code</span>
                  <input
                    value={settings.pairingCode}
                    onChange={(e) => persist({ pairingCode: e.target.value })}
                    placeholder="6-digit code"
                    className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] text-muted-foreground">Your name</span>
                  <input
                    value={settings.peer.name}
                    onChange={(e) =>
                      persist({
                        peer: { ...settings.peer, name: e.target.value },
                      })
                    }
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] text-muted-foreground">Join as</span>
                  <select
                    value={settings.peer.role}
                    onChange={(e) =>
                      persist({
                        peer: {
                          ...settings.peer,
                          role: e.target.value as LANRole,
                        },
                      })
                    }
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="editor">Editor — can make changes</option>
                    <option value="reviewer">Reviewer — can approve</option>
                    <option value="viewer">Viewer — read only</option>
                  </select>
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={() => run(() => connectLAN(settings))}
              disabled={!settings.url || !settings.pairingCode || busy}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Join session
            </button>
          </>
        )}

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
        )}

        {/* Advanced toggle (host mode only, not connected) */}
        {mode === "host" && !connected && (
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Advanced
          </button>
        )}
        {showAdvanced && mode === "host" && !connected && (
          <div className="space-y-1">
            <label>
              <span className="mb-1 block text-[10px] text-muted-foreground">Role</span>
              <select
                value={settings.peer.role}
                onChange={(e) =>
                  persist({
                    peer: { ...settings.peer, role: e.target.value as LANRole },
                  })
                }
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="host">Host — full control</option>
                <option value="editor">Editor — can make changes</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
