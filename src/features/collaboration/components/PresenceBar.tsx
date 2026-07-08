"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Users, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/shared/utils";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  getLANPeers,
  getLANStatus,
  type LANPeer,
  type LANStatus,
  publishPresence,
  readLANSettings,
  subscribeLAN,
} from "@/platform/lan/lan-collab";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";

// ─── Color hash (fallback only — peers carry their own color) ─────────────────

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// ─── Presence status from awareness lastSeenAt ────────────────────────────────

const IDLE_THRESHOLD_MS = 5 * 60_000;
const AWAY_THRESHOLD_MS = 15 * 60_000;

type PresenceStatus = "active" | "idle" | "away";

function statusFromLastSeen(lastSeenAt: number | undefined): PresenceStatus {
  if (!lastSeenAt) return "active";
  const delta = Date.now() - lastSeenAt;
  if (delta > AWAY_THRESHOLD_MS) return "away";
  if (delta > IDLE_THRESHOLD_MS) return "idle";
  return "active";
}

// ─── Awareness-backed presence (replaces the BroadcastChannel heartbeat) ──────
//
// Presence now rides `y-protocols/awareness` over the LAN provider (same socket
// as the doc), surfaced by `@/platform/lan/lan-collab`. This deletes the manual
// 10s heartbeat + 30s prune intervals and the per-render `me` object churn that
// the old single-machine BroadcastChannel implementation had — awareness
// auto-prunes a peer ~30s after it stops refreshing. For same-machine multi-tab
// without a relay, the BroadcastChannel Yjs provider (`startCollabSync`) carries
// the doc; cross-machine reach is the LAN upgrade — one code path, two levels.

interface PresenceSnapshot {
  status: LANStatus;
  peers: LANPeer[];
}

// Module-level cache so `useSyncExternalStore` only re-renders on a real change.
let snapshotCache: PresenceSnapshot = {
  status: typeof window === "undefined" ? "off" : getLANStatus(),
  peers: typeof window === "undefined" ? [] : getLANPeers(),
};

function presenceSubscribe(onChange: () => void): () => void {
  return subscribeLAN(() => {
    const status = getLANStatus();
    const peers = getLANPeers();
    if (status !== snapshotCache.status || peers !== snapshotCache.peers) {
      snapshotCache = { status, peers };
      onChange();
    }
  });
}

function presenceSnapshot(): PresenceSnapshot {
  return snapshotCache;
}

function usePresence(username: string, currentPage: string) {
  const { status, peers } = useSyncExternalStore(
    presenceSubscribe,
    presenceSnapshot,
    presenceSnapshot,
  );

  // Re-read the durable LAN identity when the displayed name changes (renamed
  // via the popover); otherwise it is stable across renders.
  // biome-ignore lint/correctness/useExhaustiveDependencies: username is an intentional trigger to re-read the durable LAN identity after a rename; it is not read in the memo body.
  const me = useMemo(() => readLANSettings().peer, [username]);

  // Publish our durable identity (name/page) to awareness so connected peers see
  // us in their lists. Low-frequency: only on name/page change, never per render.
  const lastPublished = useRef<string>("");
  useEffect(() => {
    if (status !== "connected") return;
    const key = `${username}|${currentPage}`;
    if (lastPublished.current === key) return;
    lastPublished.current = key;
    publishPresence({ name: username, page: currentPage });
  }, [username, currentPage, status]);

  // Other peers = everyone in awareness except ourselves (matched by peer id).
  const others = useMemo(() => peers.filter((p) => p.id !== me.id), [peers, me.id]);

  return { me, peers: others, connected: status === "connected" };
}

// ─── User avatar with tooltip ─────────────────────────────────────────────────

function PresenceAvatar({ user, isMe }: { user: LANPeer; isMe?: boolean }) {
  const [showTip, setShowTip] = useState(false);
  const status = statusFromLastSeen(user.lastSeenAt);
  const router = useRouter();
  // "Jump to user": a peer publishing a page can be followed with one click.
  const canJump = Boolean(user.page && !isMe && user.page.startsWith("/dashboard"));

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!canJump}
        onClick={() => {
          if (canJump && user.page) router.push(user.page);
        }}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        title={canJump ? `Aller à la page de ${user.name}` : undefined}
        className={cn("block rounded-full", canJump ? "cursor-pointer" : "cursor-default")}
      >
        <Avatar>
          <AvatarFallback
            className={cn("text-white text-xs font-semibold", hashColor(user.name))}
            style={user.color ? { backgroundColor: user.color } : undefined}
          >
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
      </button>

      {/* Status dot */}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
          status === "active" && "bg-emerald-500",
          status === "idle" && "bg-amber-400",
          status === "away" && "bg-muted-foreground",
        )}
      />

      {/* "You" badge */}
      {isMe && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-sm bg-primary px-1 py-px text-[8px] font-bold text-primary-foreground leading-tight">
          You
        </span>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          >
            <p className="font-semibold">{user.name}</p>
            <p className="text-muted-foreground capitalize">
              {status} · {user.role}
            </p>
            {user.page && <p className="text-muted-foreground truncate max-w-40">{user.page}</p>}
            {canJump && <p className="text-primary">Cliquer pour rejoindre</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PresenceBarProps {
  currentPage?: string;
}

export function PresenceBar({ currentPage = "Collab Hub" }: PresenceBarProps) {
  const username = useCollabHubStore.use.username();
  const { me, peers, connected } = usePresence(username, currentPage);

  const allUsers = useMemo<LANPeer[]>(
    () => [{ ...me, name: username }, ...peers],
    [me, username, peers],
  );
  const activeCount = useMemo(
    () => allUsers.filter((u) => statusFromLastSeen(u.lastSeenAt) === "active").length,
    [allUsers],
  );

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs">
      {/* Left: status icon */}
      <div className="flex items-center gap-1.5">
        {connected ? (
          <Wifi className="size-4 text-emerald-500" />
        ) : (
          <WifiOff className="size-4 text-muted-foreground" />
        )}
      </div>

      {/* Center: avatars */}
      <AvatarGroup>
        <AnimatePresence>
          {allUsers.slice(0, 7).map((user) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <PresenceAvatar user={user} isMe={user.id === me.id} />
            </motion.div>
          ))}
        </AnimatePresence>
        {allUsers.length > 7 && (
          <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background">
            +{allUsers.length - 7}
          </div>
        )}
      </AvatarGroup>

      {/* Counter */}
      <div className="flex items-center gap-1.5 text-sm">
        <Users className="size-4 text-muted-foreground" />
        <span className="font-medium">{allUsers.length}</span>
        <span className="text-muted-foreground">
          {allUsers.length === 1 ? "person" : "people"} {connected ? "in session" : "viewing"}
        </span>
        {activeCount > 0 && (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
            {activeCount} active
          </Badge>
        )}
      </div>

      {/* Display name — editable in Settings > Account */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          You are <span className="font-medium text-foreground">{username}</span>
        </span>
      </div>
    </div>
  );
}
