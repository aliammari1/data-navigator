"use client";

import {
  Cable,
  CheckCircle,
  ChevronDown,
  Copy,
  Eye,
  FileUp,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import {
  buildLANCommand,
  connectLAN,
  disconnectLAN,
  discoverLAN,
  getLANJoinUrl,
  getLANPeers,
  getLANStatus,
  type LANAuditEntry,
  type LANDiscovery,
  type LANPeer,
  type LANScanResult,
  publishFileDrop,
  publishSelection,
  readLANAudit,
  readLANSettings,
  readSharedFileDrop,
  saveLANSettings,
  scanLANSubnet,
  subscribeLAN,
  subscribeLANAudit,
  subscribeLANRoom,
  uploadLANFile,
} from "@/features/telecom/lib/lan-collab";

function randomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

type ActiveTab = "session" | "files" | "activity";

export function LanCollabPanel() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("session");
  const [settings, setSettings] = useState(() => readLANSettings());
  const [status, setStatus] = useState(getLANStatus());
  const [peers, setPeers] = useState<LANPeer[]>(getLANPeers());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [discovery, setDiscovery] = useState<LANDiscovery | null>(null);
  const [audit, setAudit] = useState<LANAuditEntry[]>(() => readLANAudit());
  const [fileDrop, setFileDrop] = useState(readSharedFileDrop());
  const [selection, setSelection] = useState("overview");
  const [scanResults, setScanResults] = useState<LANScanResult[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const unsubStatus = subscribeLAN(() => {
      setStatus(getLANStatus());
      setPeers(getLANPeers());
    });
    const unsubAudit = subscribeLANAudit(() => setAudit(readLANAudit()));
    const unsubRoom = subscribeLANRoom(() => setFileDrop(readSharedFileDrop()));
    return () => {
      unsubStatus();
      unsubAudit();
      unsubRoom();
    };
  }, []);

  const joinUrl = settings.url ? getLANJoinUrl(settings) : "";
  const command = buildLANCommand(settings);
  const connected = status === "connected";
  const connecting = status === "connecting";

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(joinUrl, { width: 200, margin: 1 })
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

  const handleFileDrop = async (file: File) => {
    setError("");
    setUploadingFile(true);
    try {
      if (connected) await uploadLANFile(file);
      else publishFileDrop(file);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      publishFileDrop(file);
    } finally {
      setUploadingFile(false);
    }
  };

  const StatusIcon = connected ? Wifi : connecting ? Cable : WifiOff;
  const statusColor = connected
    ? "text-emerald-500"
    : connecting
      ? "text-amber-500"
      : "text-muted-foreground";
  const statusLabel = connected
    ? "Connected"
    : connecting
      ? "Connecting…"
      : "Offline";
  const allAudit = [...(discovery?.audit ?? []), ...audit].slice(0, 20);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Plug className="h-4 w-4 text-cyan-500" />
        <span className="font-semibold">LAN Session — Admin</span>
        <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
          <StatusIcon className="h-3.5 w-3.5" /> {statusLabel}
        </span>
        {connected && (
          <>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {peers.length} user
              {peers.length !== 1 ? "s" : ""} connected
            </span>
            <button
              type="button"
              onClick={() => run(disconnectLAN)}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <WifiOff className="h-3.5 w-3.5" /> End session
            </button>
          </>
        )}
      </div>

      {/* ── Inner tabs when connected ── */}
      {connected && (
        <div className="flex gap-1 border-b border-border px-4 pt-2">
          {(["session", "files", "activity"] as ActiveTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`rounded-t px-3 py-1.5 text-xs font-medium capitalize transition-colors ${activeTab === t ? "border-b-2 border-cyan-500 text-cyan-600" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="p-5">
        {/* ════════ NOT CONNECTED: setup ════════ */}
        {!connected && (
          <div className="space-y-6">
            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400">
                  1
                </span>
                Run the server on this computer
              </div>
              <p className="text-xs text-muted-foreground">
                Open a terminal and run this command first, then come back.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
                <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <code className="min-w-0 flex-1 truncate font-mono text-xs">
                  {command}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(command)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400">
                  2
                </span>
                Configure your session
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Server address
                  </span>
                  <input
                    value={settings.url}
                    onChange={(e) => persist({ url: e.target.value })}
                    placeholder="ws://192.168.1.10:1234"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Room name
                  </span>
                  <input
                    value={settings.room}
                    onChange={(e) => persist({ room: e.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Access code — share this with users
                  </span>
                  <div className="flex gap-2">
                    <input
                      value={settings.pairingCode}
                      onChange={(e) => persist({ pairingCode: e.target.value })}
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono tracking-widest text-sm"
                    />
                    <button
                      type="button"
                      title="Generate new code"
                      onClick={() => persist({ pairingCode: randomCode() })}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Your name
                  </span>
                  <input
                    value={settings.peer.name}
                    onChange={(e) =>
                      persist({
                        peer: { ...settings.peer, name: e.target.value },
                      })
                    }
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs"
                  />
                </label>
              </div>
            </div>

            {/* Step 3: QR preview */}
            {qrDataUrl && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400">
                    3
                  </span>
                  Share this with users so they can join
                </div>
                <div className="flex gap-5 rounded-xl border border-border bg-background p-4">
                  <Image
                    src={qrDataUrl}
                    alt="Join QR"
                    width={160}
                    height={160}
                    className="rounded-lg"
                  />
                  <div className="flex flex-col justify-center gap-3">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Room
                      </div>
                      <div className="font-medium">{settings.room}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Access code
                      </div>
                      <div className="font-mono text-2xl font-bold tracking-[0.3em] text-cyan-600">
                        {settings.pairingCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(joinUrl)}
                      className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted"
                    >
                      {copied ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy join link
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                run(() =>
                  connectLAN({
                    ...settings,
                    peer: { ...settings.peer, role: "host" },
                  }),
                )
              }
              disabled={!settings.url || !settings.pairingCode || busy}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Open session
            </button>

            {/* Advanced */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
                Advanced options
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        run(async () => {
                          setDiscovery(await discoverLAN(settings.url));
                        })
                      }
                      disabled={!settings.url || busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <Wifi className="h-3.5 w-3.5" /> Probe server
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run(async () => {
                          const results = await scanLANSubnet({
                            sampleUrl: settings.url,
                          });
                          setScanResults(results);
                          if (results[0]?.url) persist({ url: results[0].url });
                        })
                      }
                      disabled={!settings.url || busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wifi className="h-3.5 w-3.5" />
                      )}
                      Scan subnet
                    </button>
                  </div>
                  {scanResults.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {scanResults.map((r) => (
                        <button
                          key={r.url}
                          type="button"
                          onClick={() => persist({ url: r.url })}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700 hover:bg-emerald-100"
                        >
                          {r.url}
                          {r.latencyMs ? ` · ${r.latencyMs}ms` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {discovery && (
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
                      {discovery.websocketUrls.length} URL(s) · rooms:{" "}
                      {discovery.rooms.map((r) => r.name).join(", ") || "none"}{" "}
                      · inbox: {discovery.files?.length ?? 0} file(s)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════ CONNECTED: SESSION ════════ */}
        {connected && activeTab === "session" && (
          <div className="space-y-5">
            {qrDataUrl && (
              <div className="flex gap-5 rounded-xl border border-border bg-background p-4">
                <Image
                  src={qrDataUrl}
                  alt="Join QR"
                  width={160}
                  height={160}
                  className="rounded-lg"
                />
                <div className="flex flex-col justify-center gap-3">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Room
                    </div>
                    <div className="font-medium">{settings.room}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Access code
                    </div>
                    <div className="font-mono text-2xl font-bold tracking-[0.3em] text-cyan-600">
                      {settings.pairingCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(joinUrl)}
                    className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted"
                  >
                    {copied ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy invite link
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Users className="h-4 w-4" /> Connected users
              </div>
              {peers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No users yet. Share the QR code or access code above.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {peers.map((peer) => (
                    <div
                      key={peer.id}
                      className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: peer.color }}
                      />
                      <span className="font-medium">{peer.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {peer.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Broadcast current view to all users
              </div>
              <input
                value={selection}
                onChange={(e) => {
                  setSelection(e.target.value);
                  publishSelection(e.target.value);
                }}
                placeholder="e.g. dashboard / chart-3"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs"
              />
            </div>
          </div>
        )}

        {/* ════════ CONNECTED: FILES ════════ */}
        {connected && activeTab === "files" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <FileUp className="h-4 w-4" /> Share a file with users
              </div>
              <p className="text-xs text-muted-foreground">
                Uploaded files are announced to all connected users and stored
                in the host inbox.
              </p>
              <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground hover:border-cyan-400 hover:bg-cyan-50/30 dark:hover:bg-cyan-900/10">
                <FileUp className="h-5 w-5" />
                <span className="text-xs">Click to choose a file</span>
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileDrop(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {uploadingFile && (
                <p className="text-xs text-cyan-600">Uploading…</p>
              )}
            </div>
            {fileDrop && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{fileDrop.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(fileDrop.size)} · shared by {fileDrop.by.name}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ CONNECTED: ACTIVITY ════════ */}
        {connected && activeTab === "activity" && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4" /> Session activity
            </div>
            {allAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events recorded yet.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-auto">
                {allAudit.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
                  >
                    <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{entry.event}</span>
                      {entry.peerName && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {entry.peerName}
                        </span>
                      )}
                      {entry.detail && (
                        <div className="text-muted-foreground">
                          {entry.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
