// FACTS: importers — MoudirSwarmScreen.tsx (stage body, replacing the deleted
//   AgentScene). API/data — reads useSwarmStore (@/features/data-formulator/store/
//   swarm-store): phase, plan{goal,tasks:AgentTask[]}, runs:Record<id,AgentRunState>,
//   order:string[]; subscribed via .subscribe into a ref (no React re-render per frame).
//   AgentTask{id,role,title,dependsOn:string[]}; role∈ROLE_META (planner/query/chart/
//   narrative/anomaly/critic/synthesizer, each with a warm HSL `hue`). AgentRunState
//   {task,status('queued'|'thinking'|'streaming'|'running'|'done'|'failed'|'skipped'),
//   partial,startedAt?,finishedAt?,verdict?}. Reuses ROLE_META/MOUDIR/statusMeta/
//   formatElapsed grammar from moudir-kit + agent-lane. data/DAG layered by topological
//   depth (Sugiyama-lite, deterministic), edges = dependsOn (data flow), particles on
//   active edges. user-instruction: "canvas Moudir experience, remove three.js" —
//   pure HTML5 <canvas> 2D, dpr-aware, rAF, ResizeObserver, reduced-motion aware,
//   offline (no assets/fonts/network), labels live in a DOM HUD (crisp text).
"use client";

/**
 * Moudir — SwarmCanvas: the "war room" stage.
 *
 * A single HTML5 <canvas> (2D context) that visualizes the live agent swarm from
 * `useSwarmStore` as a layered DAG (Sugiyama-lite by dependency depth):
 * planner → query/anomaly → chart/narrative → critic → synthesizer. Edges are the
 * task `dependsOn` relations; when an upstream task is `done` and its downstream is
 * live (thinking/streaming/running) the edge brightens to coral and carries flowing
 * particles — "data is moving right now". Node status drives ring color + motion
 * (coral=LLM thinking/streaming, gold=IO running, green=done, rose=failed). The
 * Arabic م mark anchors the far left as the dispatch source. At `idle` the team
 * rests in a quiet ring around the breathing mark.
 *
 * Architecture (perf): the component renders ONCE and never re-renders during a run.
 * A `useSwarmStore.subscribe` writes the latest store snapshot into a mutable ref;
 * a single rAF loop reads the ref, lerps node positions, advances particles, and
 * draws. Layout (target x/y + edge control points) is recomputed only when the task
 * SET changes — status changes never reflow. The loop idles itself when nothing is
 * animating. Labels are positioned in a sibling DOM HUD (canvas text blurs at dpr
 * scaling). Theme tokens are resolved via getComputedStyle and re-read on a
 * documentElement MutationObserver so colors track live light/dark switches.
 *
 * Fully offline: zero external assets, no fonts loaded into canvas, no network.
 * Reduced-motion aware: drops particles/halos/blooms/shake and draws static states.
 */

import { useEffect, useRef, useState } from "react";
import type { AgentRole, AgentRunState, AgentStatus, SwarmPhase } from "../../../core/swarm/types";
import { useSwarmStore } from "../../../store/swarm-store";
import { MOUDIR, ROLE_META } from "../moudir-kit";

// ─── Tunables ──────────────────────────────────────────────────────────────────

const PAD_X = 96; // left/right stage inset (CSS px); the م source lives in the left pad
const PAD_Y = 56; // top/bottom stage inset
const COL_GAP_MIN = 150; // min horizontal gap between DAG layers
const MAX_ROW_GAP = 132; // max vertical gap between sibling nodes in a column
const NODE_W_MAX = 132;
const NODE_W_MIN = 104;
const NODE_H_MAX = 52;
const NODE_H_MIN = 44;
const NODE_R = 14; // chip corner radius
const LERP = 0.12; // position easing per frame
const BLOOM_MS = 520; // one-shot "done" bloom duration
const SHAKE_MS = 320; // one-shot "failed" shake duration
const STREAM_FULL_CHARS = 600; // partial length that fills the progress underline
const MAX_PARTICLES = 60; // global particle cap (perf)

// Fixed status hues (stable across themes), mirroring statusMeta() tones.
const RING_CORAL = MOUDIR.coral;
const RING_GOLD = MOUDIR.gold;
const RING_GREEN = MOUDIR.green;
const RING_ROSE = MOUDIR.rose;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Append a 2-hex alpha (0–1) to a 6-digit hex color, e.g. coral + 0.5 → "#17a2c980". */
function hexA(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** Per-role accent as an rgba-capable HSL string at a given alpha. */
function roleHsl(role: AgentRole, alpha = 1): string {
  return `hsl(${ROLE_META[role].hue} 78% 55% / ${alpha})`;
}

/** Point on a cubic Bézier at parameter t. */
function bezier(
  t: number,
  p0: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p1: { x: number; y: number },
): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** lerp two HSL role hues (for particle color transforming dep→dependent). */
function lerpHue(from: number, to: number, t: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let h = from + d * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return h;
}

/** Short "1.2s" / "1m 04s" elapsed formatter (mirrors agent-lane). */
function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

const LIVE: ReadonlySet<AgentStatus> = new Set(["thinking", "streaming", "running"]);

// ─── Scene model ───────────────────────────────────────────────────────────────

interface SceneNode {
  id: string;
  role: AgentRole;
  title: string;
  depsCount: number;
  // animated position (CSS px) and its target
  x: number;
  y: number;
  tx: number;
  ty: number;
  placed: boolean; // false until first layout (so it eases in from the source)
  w: number;
  h: number;
  // live status snapshot
  status: AgentStatus;
  partialLen: number;
  startedAt?: number;
  finishedAt?: number;
  // one-shot timestamps for blooms / shakes
  doneAt: number | null;
  failedAt: number | null;
}

interface SceneEdge {
  from: string; // dependency id (or "__moudir__" source)
  to: string; // dependent id
}

interface Particle {
  edgeKey: string;
  t: number;
  speed: number;
}

/** Latest store snapshot, mirrored into a ref each store change (no re-render). */
interface StoreSnapshot {
  phase: SwarmPhase;
  taskKey: string; // identity of the task SET (drives relayout)
  tasks: { id: string; role: AgentRole; title: string; dependsOn: string[] }[];
  runs: Record<string, AgentRunState>;
}

const MOUDIR_SRC = "__moudir__";

function snapshot(): StoreSnapshot {
  const s = useSwarmStore.getState();
  const tasks = (s.plan?.tasks ?? []).map((t) => ({
    id: t.id,
    role: t.role,
    title: t.title,
    dependsOn: t.dependsOn,
  }));
  return {
    phase: s.phase,
    taskKey: tasks.map((t) => `${t.id}:${t.dependsOn.join(",")}`).join("|"),
    tasks,
    runs: s.runs,
  };
}

/** HUD label published from the rAF loop into React state for crisp DOM text. */
interface HudLabel {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  role: AgentRole;
  title: string;
  status: AgentStatus;
  elapsed: string | null;
}

// ─── Layout (Sugiyama-lite by topological depth) ────────────────────────────────

/**
 * Compute longest-path depth from the planner for each node, group into columns,
 * order rows with a 1-pass barycenter heuristic to reduce crossings, and assign
 * target (tx,ty) in CSS px. Mutates the node map in place; returns nothing.
 */
function layout(
  nodes: Map<string, SceneNode>,
  edges: SceneEdge[],
  width: number,
  height: number,
): void {
  if (nodes.size === 0) return;

  // 1. longest-path depth (planner / dep-less = 0).
  const depById = new Map<string, string[]>();
  for (const n of nodes.values()) depById.set(n.id, []);
  for (const e of edges) {
    if (e.from === MOUDIR_SRC) continue;
    depById.get(e.to)?.push(e.from);
  }
  const depthCache = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) return 0; // cycle guard (shouldn't happen for a DAG)
    stack.add(id);
    const deps = depById.get(id) ?? [];
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((p) => depthOf(p, stack)));
    stack.delete(id);
    depthCache.set(id, d);
    return d;
  };
  for (const id of nodes.keys()) depthOf(id, new Set());

  // 2. group by depth → columns.
  const columns = new Map<number, SceneNode[]>();
  let maxDepth = 0;
  for (const n of nodes.values()) {
    const d = depthCache.get(n.id) ?? 0;
    maxDepth = Math.max(maxDepth, d);
    const col = columns.get(d) ?? [];
    col.push(n);
    columns.set(d, col);
  }

  // scale node size down as the busiest column grows.
  let maxColLen = 1;
  for (const col of columns.values()) maxColLen = Math.max(maxColLen, col.length);
  const sizeScale = Math.max(0, Math.min(1, (6 - maxColLen) / 4)); // ≤2 nodes → full, ≥6 → min
  const nodeW = Math.round(NODE_W_MIN + (NODE_W_MAX - NODE_W_MIN) * sizeScale);
  const nodeH = Math.round(NODE_H_MIN + (NODE_H_MAX - NODE_H_MIN) * sizeScale);

  const usableW = Math.max(1, width - PAD_X * 2);
  const colGap = maxDepth > 0 ? Math.max(COL_GAP_MIN, usableW / maxDepth) : 0;

  // 3. row ordering per column: barycenter on previous column's assigned Y.
  const yOf = new Map<string, number>();
  const sortedDepths = [...columns.keys()].sort((a, b) => a - b);

  for (const d of sortedDepths) {
    const col = columns.get(d)!;
    if (d > 0) {
      // barycenter = mean Y of this node's deps (already placed in shallower cols).
      const bary = (n: SceneNode): number => {
        const deps = depById.get(n.id) ?? [];
        const ys = deps.map((p) => yOf.get(p)).filter((v): v is number => v != null);
        return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : height / 2;
      };
      col.sort((a, b) => bary(a) - bary(b));
    }

    const n = col.length;
    const usableH = Math.max(1, height - PAD_Y * 2);
    const rowGap = Math.min(MAX_ROW_GAP, n > 1 ? usableH / (n - 1) : 0);
    const span = rowGap * (n - 1);
    const top = height / 2 - span / 2;

    const x = PAD_X + d * colGap;
    col.forEach((node, i) => {
      node.w = nodeW;
      node.h = nodeH;
      node.tx = x;
      node.ty = n === 1 ? height / 2 : top + i * rowGap;
      yOf.set(node.id, node.ty);
      if (!node.placed) {
        // ease in from the م source anchor on the left edge.
        node.x = PAD_X * 0.35;
        node.y = height / 2;
        node.placed = true;
      }
    });
  }
}

/** Resting position of the م source anchor (depth -1, vertical center). */
function sourcePos(height: number): { x: number; y: number } {
  return { x: PAD_X * 0.42, y: height / 2 };
}

// ─── Theme token resolution ──────────────────────────────────────────────────

interface ThemeTokens {
  border: string; // --glass-border
  textDim: string; // --glass-text-dim
  bgStrong: string; // --glass-bg-strong (chip fill)
}

function readTheme(host: HTMLElement): ThemeTokens {
  const cs = getComputedStyle(host);
  const get = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v.length ? v : fallback;
  };
  return {
    border: get("--glass-border", "rgba(70,50,30,0.14)"),
    textDim: get("--glass-text-dim", "rgba(52,40,28,0.55)"),
    bgStrong: get("--glass-bg-strong", "rgba(255,250,244,0.74)"),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * The center-stage swarm visualization. Pure view: subscribes to `useSwarmStore`
 * and never writes to it. Sizes itself to its parent (which should be
 * `position:relative`); the canvas fills `absolute inset-0`, with a sibling DOM
 * HUD overlay for crisp node labels, the phase title, run timer, legend, and the
 * idle intro line. The host wrapper handles pointer events for hover hit-testing.
 *
 * No props — it reads everything it needs from the store and from CSS theme
 * tokens. Drop it inside the stage column of MoudirSwarmScreen.
 */
export function SwarmCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable scene state lives in refs so the rAF loop never triggers re-renders.
  const snapRef = useRef<StoreSnapshot>(snapshot());
  const nodesRef = useRef<Map<string, SceneNode>>(new Map());
  const edgesRef = useRef<SceneEdge[]>([]);
  const ctrlRef = useRef<
    Map<string, { c1: { x: number; y: number }; c2: { x: number; y: number } }>
  >(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const lastTaskKeyRef = useRef<string>("");
  const themeRef = useRef<ThemeTokens>({
    border: "rgba(70,50,30,0.14)",
    textDim: "rgba(52,40,28,0.55)",
    bgStrong: "rgba(255,250,244,0.74)",
  });
  const reduceRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef<boolean>(false);
  const hoverRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);

  // HUD state — only this is React state; it updates a few times/sec, not per frame.
  const [hud, setHud] = useState<{
    labels: HudLabel[];
    phaseTitle: string;
    agentCount: number;
    runTimer: string | null;
    idle: boolean;
    tooltip: { x: number; y: number; lines: string[]; verdict: string | null } | null;
  }>({ labels: [], phaseTitle: "", agentCount: 0, runTimer: null, idle: true, tooltip: null });

  // ── effect: own the canvas lifecycle (one mount, no deps so it never tears down).
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    // Non-null binding so the narrowing survives into the nested draw()/resize() closures
    // (TS does not preserve the `if (!ctx) return` guard across captured function declarations).
    const ctx: CanvasRenderingContext2D = ctx2d;

    let hudAcc = 0; // throttle HUD publishing
    let lastFrame = performance.now();

    // — reduced motion —
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceRef.current = mq.matches;
    const onMq = () => {
      reduceRef.current = mq.matches;
      kick();
    };
    mq.addEventListener("change", onMq);

    // — theme tokens (re-read on theme/class change) —
    themeRef.current = readTheme(document.documentElement);
    const themeObs = new MutationObserver(() => {
      themeRef.current = readTheme(document.documentElement);
      kick();
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-glass", "style"],
    });

    // — sizing —
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      relayout(true); // re-target positions for the new box
      kick();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // — rebuild the scene graph when the task SET changes (status never reflows) —
    function rebuild() {
      const snap = snapRef.current;
      const { h } = sizeRef.current;
      const nodes = nodesRef.current;
      const next = new Set(snap.tasks.map((t) => t.id));

      // drop removed
      for (const id of [...nodes.keys()]) if (!next.has(id)) nodes.delete(id);

      // add / update
      for (const t of snap.tasks) {
        const existing = nodes.get(t.id);
        if (existing) {
          existing.role = t.role;
          existing.title = t.title;
          existing.depsCount = t.dependsOn.length;
        } else {
          const src = sourcePos(h);
          nodes.set(t.id, {
            id: t.id,
            role: t.role,
            title: t.title,
            depsCount: t.dependsOn.length,
            x: src.x,
            y: src.y,
            tx: src.x,
            ty: src.y,
            placed: false,
            w: NODE_W_MAX,
            h: NODE_H_MAX,
            status: "queued",
            partialLen: 0,
            doneAt: null,
            failedAt: null,
          });
        }
      }

      // edges: dependsOn pairs, plus a م → roots edge for dep-less tasks.
      const edges: SceneEdge[] = [];
      for (const t of snap.tasks) {
        if (t.dependsOn.length === 0) {
          edges.push({ from: MOUDIR_SRC, to: t.id });
        } else {
          for (const dep of t.dependsOn) {
            if (nodes.has(dep)) edges.push({ from: dep, to: t.id });
          }
        }
      }
      edgesRef.current = edges;
      lastTaskKeyRef.current = snap.taskKey;
      relayout(false);
    }

    // — recompute targets + edge control points —
    function relayout(sizeOnly: boolean) {
      const { w, h } = sizeRef.current;
      const nodes = nodesRef.current;
      if (!sizeOnly && nodes.size === 0) {
        ctrlRef.current.clear();
        return;
      }
      layout(nodes, edgesRef.current, w, h);
      // control points are recomputed each frame from live positions (cheap), but
      // we precompute here too so the very first frame is correct.
      computeControls();
    }

    function computeControls() {
      const { h } = sizeRef.current;
      const nodes = nodesRef.current;
      const src = sourcePos(h);
      const ctrl = ctrlRef.current;
      ctrl.clear();
      for (const e of edgesRef.current) {
        const from = e.from === MOUDIR_SRC ? src : nodes.get(e.from);
        const to = nodes.get(e.to);
        if (!from || !to) continue;
        const sx =
          e.from === MOUDIR_SRC ? src.x : (from as SceneNode).x + (from as SceneNode).w / 2;
        const sy = e.from === MOUDIR_SRC ? src.y : (from as SceneNode).y;
        const tx = to.x - to.w / 2;
        const ty = to.y;
        const dx = tx - sx;
        ctrl.set(`${e.from}->${e.to}`, {
          c1: { x: sx + dx * 0.5, y: sy },
          c2: { x: tx - dx * 0.5, y: ty },
        });
      }
    }

    // — store subscription: snapshot into the ref, rebuild on task-set change, kick —
    const unsub = useSwarmStore.subscribe((state) => {
      const snap: StoreSnapshot = {
        phase: state.phase,
        taskKey: (state.plan?.tasks ?? []).map((t) => `${t.id}:${t.dependsOn.join(",")}`).join("|"),
        tasks: (state.plan?.tasks ?? []).map((t) => ({
          id: t.id,
          role: t.role,
          title: t.title,
          dependsOn: t.dependsOn,
        })),
        runs: state.runs,
      };
      snapRef.current = snap;
      if (snap.taskKey !== lastTaskKeyRef.current) rebuild();
      if (startTimeRef.current === 0 && state.startedAt) startTimeRef.current = state.startedAt;
      if (state.phase === "idle") startTimeRef.current = 0;
      kick();
    });
    // seed from current store
    rebuild();
    const seed = useSwarmStore.getState();
    if (seed.startedAt) startTimeRef.current = seed.startedAt;

    // — pointer hover hit-test (host handles pointer; HUD is pointer-events-none) —
    const onMove = (ev: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      let hit: string | null = null;
      for (const n of nodesRef.current.values()) {
        if (
          px >= n.x - n.w / 2 &&
          px <= n.x + n.w / 2 &&
          py >= n.y - n.h / 2 &&
          py <= n.y + n.h / 2
        ) {
          hit = n.id;
          break;
        }
      }
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        kick();
      }
    };
    const onLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        kick();
      }
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    // — sync live status from the snapshot into nodes; flag one-shots —
    function syncStatus(now: number): boolean {
      const runs = snapRef.current.runs;
      let anyLive = false;
      for (const n of nodesRef.current.values()) {
        const run = runs[n.id];
        const status = run?.status ?? "queued";
        if (status !== n.status) {
          if (status === "done" && n.doneAt == null) n.doneAt = now;
          if (status === "failed" && n.failedAt == null) n.failedAt = now;
          n.status = status;
        }
        n.partialLen = run?.partial.length ?? 0;
        n.startedAt = run?.startedAt;
        n.finishedAt = run?.finishedAt;
        if (LIVE.has(status)) anyLive = true;
      }
      return anyLive;
    }

    // — particles on active edges (dep done + dependent live) —
    function activeEdgeKeys(): string[] {
      const runs = snapRef.current.runs;
      const keys: string[] = [];
      for (const e of edgesRef.current) {
        const toStatus = runs[e.to]?.status ?? "queued";
        if (!LIVE.has(toStatus)) continue;
        if (e.from === MOUDIR_SRC) {
          keys.push(`${e.from}->${e.to}`);
          continue;
        }
        const fromStatus = runs[e.from]?.status ?? "queued";
        if (fromStatus === "done") keys.push(`${e.from}->${e.to}`);
      }
      return keys;
    }

    function stepParticles(active: string[]) {
      if (reduceRef.current) {
        particlesRef.current = [];
        return;
      }
      const ps = particlesRef.current;
      // advance + wrap
      for (const p of ps) {
        p.t += p.speed;
        if (p.t >= 1) p.t -= 1;
      }
      // prune particles whose edge is no longer active
      const activeSet = new Set(active);
      for (let i = ps.length - 1; i >= 0; i--) {
        if (!activeSet.has(ps[i].edgeKey)) ps.splice(i, 1);
      }
      // spawn up to the per-edge target (streaming denser than thinking), global cap.
      const runs = snapRef.current.runs;
      for (const key of active) {
        const toId = key.split("->")[1];
        const dense = runs[toId]?.status === "streaming";
        const target = dense ? 4 : 2;
        const have = ps.filter((p) => p.edgeKey === key).length;
        for (let i = have; i < target && ps.length < MAX_PARTICLES; i++) {
          ps.push({
            edgeKey: key,
            t: Math.random(),
            speed: 0.012 + Math.random() * 0.006,
          });
        }
      }
    }

    // — the draw —
    function draw(now: number) {
      const { w, h } = sizeRef.current;
      const theme = themeRef.current;
      const reduce = reduceRef.current;
      const snap = snapRef.current;
      const nodes = nodesRef.current;
      const src = sourcePos(h);

      ctx.clearRect(0, 0, w, h);

      // ambient coral glow — intensity tracks phase energy (faint→bright→cool).
      const energy =
        snap.phase === "working"
          ? 1
          : snap.phase === "verifying" || snap.phase === "synthesizing"
            ? 0.8
            : snap.phase === "dispatching" || snap.phase === "planning"
              ? 0.5
              : snap.phase === "done"
                ? 0.35
                : snap.phase === "failed"
                  ? 0.25
                  : 0.18;
      const glow = ctx.createRadialGradient(w * 0.5, h * 0.12, 0, w * 0.5, h * 0.12, h * 0.95);
      glow.addColorStop(0, hexA(MOUDIR.coral, 0.1 * energy));
      glow.addColorStop(0.55, hexA(MOUDIR.coral, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // recompute edge controls from live positions (cheap; ≤~12 edges).
      computeControls();
      const ctrl = ctrlRef.current;
      const runs = snap.runs;

      // ── edges ──
      for (const e of edgesRef.current) {
        const cp = ctrl.get(`${e.from}->${e.to}`);
        if (!cp) continue;
        const from = e.from === MOUDIR_SRC ? src : nodes.get(e.from);
        const to = nodes.get(e.to);
        if (!from || !to) continue;
        const p0 =
          e.from === MOUDIR_SRC
            ? { x: src.x, y: src.y }
            : { x: (from as SceneNode).x + (from as SceneNode).w / 2, y: (from as SceneNode).y };
        const p1 = { x: to.x - to.w / 2, y: to.y };

        const fromDone = e.from === MOUDIR_SRC || runs[e.from]?.status === "done";
        const toStatus = runs[e.to]?.status ?? "queued";
        const toLive = LIVE.has(toStatus);
        const toDone = toStatus === "done";
        const toDead = toStatus === "skipped" || toStatus === "failed";
        const active = fromDone && toLive;
        const completed = fromDone && toDone;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(cp.c1.x, cp.c1.y, cp.c2.x, cp.c2.y, p1.x, p1.y);
        if (toDead) {
          ctx.setLineDash([4, 5]);
          ctx.globalAlpha = 0.25;
          ctx.strokeStyle = theme.border;
          ctx.lineWidth = 1.5;
        } else if (active) {
          ctx.strokeStyle = hexA(MOUDIR.coral, 0.5);
          ctx.lineWidth = 2;
        } else if (completed) {
          ctx.strokeStyle = hexA(MOUDIR.green, 0.4);
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = theme.border;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
        ctx.restore();
      }

      // ── particles (skipped under reduced motion) ──
      if (!reduce) {
        const ps = particlesRef.current;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const p of ps) {
          const cp = ctrl.get(p.edgeKey);
          if (!cp) continue;
          const [fromId, toId] = p.edgeKey.split("->");
          const from = fromId === MOUDIR_SRC ? src : nodes.get(fromId);
          const to = nodes.get(toId);
          if (!from || !to) continue;
          const p0 =
            fromId === MOUDIR_SRC
              ? { x: src.x, y: src.y }
              : { x: (from as SceneNode).x + (from as SceneNode).w / 2, y: (from as SceneNode).y };
          const p1 = { x: to.x - to.w / 2, y: to.y };
          const pt = bezier(p.t, p0, cp.c1, cp.c2, p1);
          const tail = bezier(Math.max(0, p.t - 0.05), p0, cp.c1, cp.c2, p1);
          // color transforms dep-hue → dependent-hue along the path.
          const fromHue = fromId === MOUDIR_SRC ? 11 : ROLE_META[(from as SceneNode).role].hue;
          const hue = lerpHue(fromHue, ROLE_META[to.role].hue, p.t);
          const col = `hsl(${hue} 85% 60% / 0.9)`;
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── م source anchor (breathing) ──
      {
        const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.abs(Math.sin(now / 1400));
        ctx.save();
        ctx.beginPath();
        ctx.arc(src.x, src.y, 16, 0, Math.PI * 2);
        ctx.fillStyle = hexA(MOUDIR.coral, 0.12);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = hexA(MOUDIR.coral, 0.35 + 0.25 * pulse);
        ctx.stroke();
        ctx.restore();
        // (the م glyph itself is drawn in the DOM HUD for crisp text)
      }

      // ── nodes ──
      let anyAnimating = false;
      for (const n of nodes.values()) {
        // ease position toward target.
        const dx = n.tx - n.x;
        const dy = n.ty - n.y;
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
          n.x += dx * LERP;
          n.y += dy * LERP;
          anyAnimating = true;
        } else {
          n.x = n.tx;
          n.y = n.ty;
        }

        const meta = statusTone(n.status);
        const live = LIVE.has(n.status);
        let ox = 0; // shake offset
        let scale = 1;

        // failed shake (one-shot)
        if (!reduce && n.failedAt != null) {
          const dt = now - n.failedAt;
          if (dt < SHAKE_MS) {
            ox = Math.sin(dt / 28) * 2 * (1 - dt / SHAKE_MS);
            anyAnimating = true;
          }
        }
        // queued breathing
        if (!reduce && n.status === "queued") {
          scale = 1 + 0.006 * Math.sin(now / 900 + n.x);
          anyAnimating = true;
        }

        const cx = n.x + ox;
        const cy = n.y;
        const w2 = (n.w * scale) / 2;
        const h2 = (n.h * scale) / 2;
        const left = cx - w2;
        const top = cy - h2;

        // halo / glow for live + done bloom (skipped under reduced motion)
        if (!reduce) {
          if (n.status === "thinking" || n.status === "streaming") {
            const r = h2 + 10 + 6 * Math.abs(Math.sin(now / 520));
            const g = ctx.createRadialGradient(cx, cy, h2, cx, cy, r + 14);
            g.addColorStop(0, hexA(MOUDIR.coral, 0.22));
            g.addColorStop(1, hexA(MOUDIR.coral, 0));
            ctx.fillStyle = g;
            ctx.fillRect(left - 24, top - 24, n.w + 48, n.h + 48);
            anyAnimating = true;
          }
          if (n.doneAt != null) {
            const dt = now - n.doneAt;
            if (dt < BLOOM_MS) {
              const k = easeOutCubic(dt / BLOOM_MS);
              const r = h2 + 6 + 22 * k;
              ctx.save();
              ctx.globalAlpha = (1 - k) * 0.5;
              ctx.strokeStyle = MOUDIR.green;
              ctx.lineWidth = 2;
              roundRectPath(
                ctx,
                cx - r,
                cy - r * (h2 / w2 || 0.7),
                r * 2,
                r * 2 * (h2 / w2 || 0.7),
                NODE_R + 6,
              );
              ctx.stroke();
              ctx.restore();
              anyAnimating = true;
            }
          }
        }

        // chip body
        ctx.save();
        ctx.globalAlpha = n.status === "skipped" ? 0.4 : n.status === "queued" ? 0.62 : 1;
        roundRectPath(ctx, left, top, n.w * scale, n.h * scale, NODE_R);
        ctx.fillStyle = theme.bgStrong;
        ctx.fill();
        // inset role-hue hairline
        ctx.lineWidth = 1;
        ctx.strokeStyle = roleHsl(n.role, 0.3);
        ctx.stroke();
        ctx.restore();

        // status ring
        if (meta.ring) {
          ctx.save();
          ctx.globalAlpha = n.status === "skipped" ? 0.3 : 1;
          roundRectPath(ctx, left, top, n.w * scale, n.h * scale, NODE_R);
          ctx.lineWidth = 1.75;
          ctx.strokeStyle = meta.ring;
          if (n.status === "running" && !reduce) {
            // gold rotating dashed arc — "machine working"
            ctx.setLineDash([6, 6]);
            ctx.lineDashOffset = -(now / 40) % 12;
            anyAnimating = true;
          }
          ctx.stroke();
          ctx.restore();
        }

        // role accent — 3px rounded left bar
        ctx.save();
        roundRectPath(ctx, left + 1.5, top + 8, 3, n.h * scale - 16, 1.5);
        ctx.fillStyle = roleHsl(n.role, n.status === "skipped" ? 0.4 : 0.9);
        ctx.fill();
        ctx.restore();

        // role dot (top-left, glyph-free for crispness — name lives in HUD)
        ctx.save();
        ctx.beginPath();
        ctx.arc(left + 14, top + 13, 3, 0, Math.PI * 2);
        ctx.fillStyle = roleHsl(n.role, 0.95);
        ctx.fill();
        ctx.restore();

        // streaming progress underline (coral, grows with partial length)
        if (n.status === "streaming") {
          const frac = Math.max(0.04, Math.min(1, n.partialLen / STREAM_FULL_CHARS));
          ctx.save();
          ctx.strokeStyle = MOUDIR.coral;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          const uy = top + n.h * scale - 3;
          ctx.beginPath();
          ctx.moveTo(left + 8, uy);
          ctx.lineTo(left + 8 + (n.w * scale - 16) * frac, uy);
          ctx.stroke();
          ctx.restore();
          anyAnimating = true;
        }

        // small done dot (bottom-right corner)
        if (n.status === "done") {
          ctx.save();
          ctx.beginPath();
          ctx.arc(left + n.w * scale - 12, top + n.h * scale - 11, 3, 0, Math.PI * 2);
          ctx.fillStyle = MOUDIR.green;
          ctx.fill();
          ctx.restore();
        }
      }

      return anyAnimating;
    }

    // — publish the HUD a few times per second (NOT every frame) —
    function publishHud(now: number) {
      const { h } = sizeRef.current;
      const snap = snapRef.current;
      const nodes = nodesRef.current;
      const runs = snap.runs;

      const labels: HudLabel[] = [];
      for (const n of nodes.values()) {
        const run = runs[n.id];
        const live = run ? LIVE.has(run.status) : false;
        let elapsed: string | null = null;
        if (live && run?.startedAt) {
          elapsed = formatElapsed((run.finishedAt ?? now) - run.startedAt);
        }
        labels.push({
          id: n.id,
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.h,
          role: n.role,
          title: n.title,
          status: n.status,
          elapsed,
        });
      }

      const phaseTitle = PHASE_LABEL[snap.phase] ?? "";
      const runTimer =
        startTimeRef.current > 0 && snap.phase !== "idle"
          ? formatElapsed(now - startTimeRef.current)
          : null;

      // hover tooltip from the streaming partial tail + critic verdict.
      let tooltip: typeof hud.tooltip = null;
      const hovered = hoverRef.current;
      if (hovered) {
        const n = nodes.get(hovered);
        const run = runs[hovered];
        if (n) {
          const partial = run?.partial ?? "";
          const lines = partial
            .trim()
            .split("\n")
            .slice(-3)
            .filter((l) => l.length > 0);
          const verdict = run?.verdict
            ? `${run.verdict.accepted ? "Vérifié" : "Rejeté"} · ${run.verdict.reason}`
            : null;
          if (lines.length || verdict) {
            tooltip = { x: n.x, y: n.y - n.h / 2 - 8, lines, verdict };
          }
        }
      }

      setHud((prev) => {
        // cheap shallow compare to avoid needless React work.
        if (
          prev.phaseTitle === phaseTitle &&
          prev.runTimer === runTimer &&
          prev.agentCount === labels.length &&
          prev.idle === (snap.phase === "idle") &&
          prev.tooltip?.x === tooltip?.x &&
          prev.tooltip?.lines.length === tooltip?.lines.length &&
          prev.labels.length === labels.length &&
          prev.labels.every((l, i) => {
            const m = labels[i];
            return (
              m &&
              l.id === m.id &&
              Math.abs(l.x - m.x) < 0.6 &&
              Math.abs(l.y - m.y) < 0.6 &&
              l.status === m.status &&
              l.elapsed === m.elapsed
            );
          })
        ) {
          return prev;
        }
        return {
          labels,
          phaseTitle,
          agentCount: labels.length,
          runTimer,
          idle: snap.phase === "idle",
          tooltip,
        };
      });
    }

    // — frame —
    function frame(now: number) {
      lastFrame = now;
      const anyLive = syncStatus(now);
      const active = activeEdgeKeys();
      stepParticles(active);
      const animating = draw(now);

      // throttle HUD to ~8/s while running, but always publish once when we stop.
      hudAcc += 16;
      const shouldStop = !animating && !anyLive && particlesRef.current.length === 0;
      if (hudAcc >= 120 || shouldStop) {
        hudAcc = 0;
        publishHud(now);
      }

      if (reduceRef.current) {
        // reduced motion: run only long enough to settle layout, then stop.
        if (animating) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          runningRef.current = false;
          rafRef.current = null;
          publishHud(now);
        }
        return;
      }

      if (shouldStop) {
        // idle throttle: stop the loop; it restarts on the next store/theme change.
        runningRef.current = false;
        rafRef.current = null;
        publishHud(now);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    // — start/restart the loop on demand —
    function kick() {
      if (runningRef.current) return;
      runningRef.current = true;
      lastFrame = performance.now();
      rafRef.current = requestAnimationFrame(frame);
    }

    kick();

    // — cleanup —
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      ro.disconnect();
      themeObs.disconnect();
      mq.removeEventListener("change", onMq);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      unsub();
    };
    // run once on mount; the loop reads everything from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0 h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* ─── DOM HUD overlay (crisp text; never intercepts pointer) ─── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* top-left: phase title + agent count + run timer */}
        {!hud.idle && (
          <div className="absolute left-4 top-3 flex flex-col gap-0.5">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: MOUDIR.coral }}
            >
              {hud.phaseTitle}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {hud.agentCount} agent{hud.agentCount > 1 ? "s" : ""}
              {hud.runTimer ? ` · ${hud.runTimer}` : ""}
            </span>
          </div>
        )}

        {/* top-right: tiny legend */}
        {!hud.idle && (
          <div className="absolute right-4 top-3 flex flex-col items-end gap-1">
            <LegendRow color={MOUDIR.coral} label="LLM" />
            <LegendRow color={MOUDIR.gold} label="E/S" />
            <LegendRow color={MOUDIR.green} label="Terminé" />
          </div>
        )}

        {/* the م source glyph (crisp DOM text over the canvas anchor) */}
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 select-none font-semibold leading-none"
          style={{
            left: PAD_X * 0.42,
            top: "50%",
            color: MOUDIR.coral,
            fontSize: 16,
            fontFamily: "'Geist', system-ui, 'Segoe UI', 'Noto Sans Arabic', sans-serif",
          }}
        >
          م
        </span>

        {/* idle intro line + nothing else (no fake nodes) */}
        {hud.idle && (
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 px-8 text-center">
            <p
              className="max-w-md text-[13px] leading-relaxed"
              style={{ color: "var(--glass-text-dim)" }}
            >
              Je décompose votre question en une équipe d’agents…
            </p>
          </div>
        )}

        {/* per-node labels positioned over each chip */}
        {!hud.idle &&
          hud.labels.map((l) => (
            <div
              key={l.id}
              className="absolute flex flex-col items-center"
              style={{
                left: 0,
                top: 0,
                width: l.w,
                transform: `translate(${l.x - l.w / 2}px, ${l.y - 7}px)`,
              }}
            >
              <span className="w-full truncate px-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                {ROLE_META[l.role].label}
              </span>
              <span className="w-full truncate px-2 text-center text-[11px] font-medium text-foreground">
                {l.title}
              </span>
              {l.elapsed && (
                <span className="mt-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
                  {l.elapsed}
                </span>
              )}
            </div>
          ))}

        {/* hover tooltip — streaming tail + critic verdict */}
        {hud.tooltip && (hud.tooltip.lines.length > 0 || hud.tooltip.verdict) && (
          <div
            className="absolute max-w-[260px] -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2"
            style={{
              left: hud.tooltip.x,
              top: hud.tooltip.y,
              background: "var(--glass-bg-strong)",
              boxShadow: "inset 0 0 0 1px var(--glass-border), var(--glass-shadow)",
              backdropFilter: "blur(8px)",
            }}
          >
            {hud.tooltip.lines.length > 0 && (
              <p className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground">
                {hud.tooltip.lines.join("\n")}
              </p>
            )}
            {hud.tooltip.verdict && (
              <p className="mt-1 text-[10px] font-medium" style={{ color: MOUDIR.green }}>
                {hud.tooltip.verdict}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HUD bits ──────────────────────────────────────────────────────────────────

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

// ─── Drawing utils ───────────────────────────────────────────────────────────

/** Rounded-rect path (no fill/stroke) — clamps radius to the box. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Status → ring color (mirrors statusMeta tones; null = no ring). */
function statusTone(status: AgentStatus): { ring: string | null } {
  switch (status) {
    case "thinking":
    case "streaming":
      return { ring: RING_CORAL };
    case "running":
      return { ring: RING_GOLD };
    case "done":
      return { ring: RING_GREEN };
    case "failed":
      return { ring: RING_ROSE };
    default:
      return { ring: null }; // queued / skipped
  }
}

// ─── Phase labels (French, mirrors phase-stepper) ────────────────────────────

const PHASE_LABEL: Record<SwarmPhase, string> = {
  idle: "Au repos",
  planning: "Plan",
  dispatching: "Dispatch",
  working: "Travail",
  verifying: "Vérification",
  synthesizing: "Synthèse",
  done: "Terminé",
  failed: "Échec",
};
