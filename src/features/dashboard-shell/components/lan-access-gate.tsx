"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Loader2, Radio, RefreshCw, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  connectLAN,
  disconnectLAN,
  getLANAuthError,
  getLANStatus,
  type LANScanResult,
  readLANSettings,
  saveLANSettings,
  scanLANSubnet,
  subscribeLAN,
} from "@/platform/lan/lan-collab";
import { generatePairingCode } from "@/platform/lan/pairing";
import { useTheme } from "@/components/theme-provider";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";

/* ── Clock ────────────────────────────────────────────────────────────── */

function useClock() {
  const [clock, setClock] = useState({ time: "", date: "" });
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const raw = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      setClock({
        time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
        date: raw.charAt(0).toUpperCase() + raw.slice(1),
      });
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

/* ── Shared styles ────────────────────────────────────────────────────── */

// Uses Tailwind dark: variants — ThemeProvider sets .dark on <html>, so these respond correctly.
const inputCls =
  "h-11 w-full rounded-xl border border-border dark:border-white/10 " +
  "bg-card dark:bg-white/[0.06] px-4 text-sm text-foreground " +
  "placeholder:text-muted-foreground dark:placeholder:text-white/25 outline-none transition-all " +
  "focus-visible:border-[#2f6bff]/70 focus-visible:ring-2 focus-visible:ring-[#2f6bff]/20";

const noiseStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  backgroundSize: "200px 200px",
};

/* ── LanAccessGate ────────────────────────────────────────────────────── */

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
  const clock = useClock();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Theme-aware background — same radial spot lights, dark navy vs light blue-tinted white.
  const bg = isDark
    ? [
        "radial-gradient(ellipse 90% 70% at 10% 0%, rgba(47,107,255,0.16) 0%, transparent 55%)",
        "radial-gradient(ellipse 60% 50% at 92% 92%, rgba(94,139,255,0.09) 0%, transparent 50%)",
        "#070b14",
      ].join(", ")
    : [
        "radial-gradient(ellipse 90% 70% at 10% 0%, rgba(47,107,255,0.07) 0%, transparent 55%)",
        "radial-gradient(ellipse 60% 50% at 92% 92%, rgba(94,139,255,0.05) 0%, transparent 50%)",
        "#eef2ff",
      ].join(", ");

  useEffect(
    () =>
      subscribeLAN(() => {
        const next = getLANStatus();
        if (next === "connected") {
          setStableConnected(true);
          setConnecting(false);
        } else {
          // Authentication rejections (wrong code, guests disabled) arrive
          // async from the hub — surface the reason instead of spinning.
          if (next === "error") {
            const reason = getLANAuthError();
            if (reason) {
              setError(reason);
              setConnecting(false);
            }
          }
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => setStableConnected(false), 800);
        }
      }),
    [],
  );

  if (isAdmin) return <>{children}</>;
  if (stableConnected === null || stableConnected) return <>{children}</>;

  const persist = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch, peer: { ...settings.peer, ...(patch.peer ?? {}) } };
    setSettings(next);
    saveLANSettings(next);
    // Keep the app-wide display name (Settings > Account, PresenceBar) in sync
    // when it's changed from here instead of there.
    if (patch.peer?.name && patch.peer.name !== settings.peer.name) {
      useCollabHubStore.getState().setUsername(patch.peer.name);
    }
  };

  const connect = async (role: "host" | "viewer") => {
    setError("");
    setConnecting(true);
    try {
      await connectLAN({ ...settings, peer: { ...settings.peer, role } });
    } catch (err) {
      setError((err as Error).message ?? String(err));
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
      setError((err as Error).message ?? String(err));
    } finally {
      scanningRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex select-none flex-col items-center overflow-auto"
      style={{ background: bg }}
    >
      {/* Noise */}
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.022]" style={noiseStyle} />

      {/* Clock */}
      <motion.div
        className="mt-[8vh] text-center"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <p
          className="tabular-nums leading-none text-foreground"
          style={{ fontSize: "clamp(44px, 9vw, 80px)", fontWeight: 300, letterSpacing: "-0.03em" }}
        >
          {clock.time || "──:──"}
        </p>
        {clock.date && (
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">{clock.date}</p>
        )}
      </motion.div>

      {/* Content area */}
      <AnimatePresence mode="wait">
        {connecting ? (
          /* ── Connecting ── */
          <motion.div
            key="connecting"
            className="mt-10 flex flex-col items-center gap-4 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="grid size-16 place-items-center rounded-full ring-[3px] ring-border"
              style={{ background: "linear-gradient(135deg, #2f6bff 0%, #1945c8 100%)" }}
            >
              <Loader2 className="size-7 animate-spin text-white" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Connecting…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Waiting for the server. Make sure the terminal command is running.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { disconnectLAN(); setConnecting(false); setError(""); }}
              className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              Cancel
            </button>
          </motion.div>
        ) : mode === "user" ? (
          /* ── User: join a session ── */
          <motion.div
            key="user"
            className="mx-auto mt-8 flex w-[320px] flex-col items-center pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="mb-4 grid size-[60px] place-items-center rounded-full ring-[3px] ring-border"
              style={{ background: "linear-gradient(135deg, #2f6bff 0%, #1945c8 100%)" }}
            >
              <Wifi className="size-6 text-white" />
            </div>

            <h2 className="text-lg font-semibold text-foreground">LAN Session</h2>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Connect to a shared dashboard on your local network.
            </p>

            <div className="mt-5 flex w-full flex-col gap-2.5">
              {/* Server URL + auto-scan */}
              <div className="flex gap-2">
                <input
                  value={settings.url}
                  onChange={(e) => persist({ url: e.target.value })}
                  placeholder="ws://192.168.1.10:1234"
                  className={`${inputCls} flex-1 font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={autoFind}
                  disabled={!settings.url || busy}
                  title="Auto-find on local network"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border dark:border-white/10 bg-card dark:bg-white/[0.06] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />}
                </button>
              </div>

              {/* Scan results */}
              {scanResults.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {scanResults.map((r) => (
                    <button
                      key={r.url}
                      type="button"
                      onClick={() => persist({ url: r.url })}
                      className="rounded-lg border border-[#2f6bff]/30 bg-[#2f6bff]/10 px-2 py-0.5 font-mono text-[10px] text-[#5e8bff] transition-colors hover:bg-[#2f6bff]/20"
                    >
                      {r.url}
                    </button>
                  ))}
                </div>
              )}

              <input
                value={settings.room}
                onChange={(e) => persist({ room: e.target.value })}
                placeholder="Room name"
                className={inputCls}
              />

              <input
                value={settings.peer.name}
                onChange={(e) => persist({ peer: { ...settings.peer, name: e.target.value } })}
                placeholder="Your name"
                className={inputCls}
              />

              <input
                type="password"
                value={settings.pairingCode}
                onChange={(e) => persist({ pairingCode: e.target.value })}
                placeholder="Access code"
                className={`${inputCls} tracking-widest`}
              />

              {error && (
                <p className="text-center text-xs text-destructive" role="alert">{error}</p>
              )}

              <button
                type="button"
                onClick={() => connect("viewer")}
                disabled={!settings.url || !settings.pairingCode}
                className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2f6bff] text-sm font-semibold text-white transition-all hover:bg-[#4878f5] active:scale-[0.98] disabled:opacity-50"
              >
                Connect <ArrowRight className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setMode("admin"); setError(""); }}
              className="mt-4 text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              Are you the admin? Start a session →
            </button>
          </motion.div>
        ) : (
          /* ── Admin: start a session ── */
          <motion.div
            key="admin"
            className="mx-auto mt-8 flex w-[320px] flex-col items-center pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="mb-4 grid size-[60px] place-items-center rounded-full ring-[3px] ring-border"
              style={{ background: "linear-gradient(135deg, #2f6bff 0%, #1945c8 100%)" }}
            >
              <Radio className="size-6 text-white" />
            </div>

            <h2 className="text-lg font-semibold text-foreground">Start LAN Session</h2>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Open your dashboard to others on the local network.
            </p>

            <div className="mt-5 flex w-full flex-col gap-2.5">
              {/* Terminal command */}
              <div className="rounded-xl border border-border/50 bg-card/50 px-3.5 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Step 1 — run in terminal
                </p>
                <code className="mt-1.5 block truncate font-mono text-[11px] text-muted-foreground">
                  PAIRING_CODE={settings.pairingCode || "123456"} PORT=1234 bun run lan-server
                </code>
              </div>

              <input
                value={settings.url}
                onChange={(e) => persist({ url: e.target.value })}
                placeholder="ws://192.168.1.10:1234"
                className={`${inputCls} font-mono text-xs`}
              />

              {/* Pairing code + regenerate */}
              <div className="flex gap-2">
                <input
                  value={settings.pairingCode}
                  onChange={(e) => persist({ pairingCode: e.target.value })}
                  placeholder="Access code"
                  className={`${inputCls} flex-1 tracking-widest`}
                />
                <button
                  type="button"
                  onClick={() => persist({ pairingCode: generatePairingCode() })}
                  title="Generate new code"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border dark:border-white/10 bg-card dark:bg-white/[0.06] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>

              {error && (
                <p className="text-center text-xs text-destructive" role="alert">{error}</p>
              )}

              <button
                type="button"
                onClick={() => connect("host")}
                disabled={!settings.url || !settings.pairingCode}
                className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2f6bff] text-sm font-semibold text-white transition-all hover:bg-[#4878f5] active:scale-[0.98] disabled:opacity-50"
              >
                Open dashboard <ArrowRight className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setMode("user"); setError(""); }}
              className="mt-4 text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              ← I have an access code
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
