# Feature Plan — channel-monitor — Real-time channel/stream monitoring + alerts

**Maturity:** partial

## Performance issues

- All five tabs live in ONE 1652-line client component (ChannelMonitorScreen.tsx). Every store mutation (notifications, events, statuses) re-renders the entire tree including hidden tabs because each tab calls useMonitorStore() with no selector, subscribing to the WHOLE store.
- ChannelHealthTab regenerates ALL channel statuses AND loops every rule x every channel inside a useEffect on every 30s tick on the main thread; alert evaluation is synchronous main-thread work that will not scale past the 10 demo channels.
- AlertTimelineTab rebuilds the ECharts scatter option object on every render and, worse, runs alertEvents.find() inside three separate .filter() passes over scatterData — an O(events^2) lookup per render (40 events now, but unbounded to 500).
- ECharts charts (echarts-for-react) render on the renderer main thread with no OffscreenCanvas/worker offload; SLA tab builds a 30-point x 6-series line + recomputes generateDailyCompliance() twice per render (once for table, once for chart).
- No virtualization: event log (.slice(0,50)) and notification list (.slice(0,20)) silently truncate instead of windowing; real alert volumes (500 cap in store) would either truncate or, if uncapped, blow up the DOM.
- Whole monitor state (including up to 500 alertEvents) is persisted to localStorage via JSON.stringify on EVERY mutation — synchronous main-thread serialization that grows unbounded and blocks on each ack/add.
- new Date().toLocaleTimeString() / toLocaleString('fr-FR') called inline in render in multiple places (lastUpdated, every event row, every notification row) — Intl formatter allocation per row per render.
- setInterval(30_000) tick fires even when the Monitor route/tab is not visible; no Page Visibility gating, so background tabs keep doing work and playing audio.
- Math.random() used inside the rule-evaluation effect (line 291) makes alert firing non-deterministic and re-runs on every tick, defeating memoization and making the feature impossible to test.

## Offline gaps

- The 'Smart Suggestions (AI)' button calls initLLMEngine()+generateText() from src/platform/ai/llm-engine.ts, which dynamically imports @mlc-ai/web-llm (line 78) — a WebGPU-ONLY engine with NO CPU fallback. On the medium-end / no-WebGPU target this throws and silently degrades to a hardcoded string; the Tech Radar explicitly REJECTS web-llm as any primary path.
- All monitored data is FAKE: generateChannelStatus / generateAlertEvents / generateDailyCompliance use seededRand(Math.sin) synthetic data. The feature is not wired to the real on-device DuckDB engine (src/core/queries/duckdb.ts useDuckDBQuery) at all, so it monitors nothing real even though the offline data engine exists.
- Persistence uses localStorage (5-10MB cap, synchronous, string-only). Alert history and rules should live in IndexedDB (Dexie) or DuckDB so they survive, can be queried, and don't block the main thread — localStorage will overflow once events are real.
- No use of the OS-level Notification API or Electron main-process notifications — 'in_app' alerts only update a Zustand array; a real monitor must alert when the window is backgrounded (Electron Notification / Web Notifications, fully offline).
- Sound alerts construct a brand-new AudioContext per beep (createOscillatorAlert) and never reuse one; browsers throttle/deny AudioContext creation without a user gesture, so alarms can silently fail — needs one persisted, gesture-unlocked AudioContext.
- Alert evaluation logic lives inside a React useEffect tied to component mount — alerts ONLY fire while the Channel Health tab is open and mounted. A monitoring system must evaluate rules continuously in a worker/main-process regardless of which tab (or whether the app window) is focused.
- No anomaly/baseline detection at all — only static thresholds. The radar calls anomaly detection an in-house gap (EWMA/MAD/CUSUM/z-score) that should run offline in a worker; nothing here computes a baseline.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `uplot` | viz / dense time-series | ~10.2k | Active, v1.6.x (single maintainer leeoniya, steady commits 2025-2026) | MIT | yes | ECharts for dense streaming lines | Canvas-2D streaming line chart: 166k pts cold-start in ~25ms, streams 3600 pts @60fps using ~10% CPU / 12MB RAM vs ECharts 70%/85MB. Ideal for per-channel live success-rate/volume sparklines on a medium-end CPU with no WebGPU. | https://github.com/leeoniya/uPlot |
| `comlink` | worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | in-effect main-thread evaluation | Already a dependency. Use it to move the rule-evaluation + anomaly engine into a dedicated Web Worker so alert evaluation never blocks the renderer main thread and runs independent of which tab is mounted. | https://github.com/GoogleChromeLabs/comlink |
| `simple-statistics` | stats / anomaly | ~3.5k | Active (v7.x) | ISC | yes | static-only thresholds | Zero-dep ~30kB. Provides medianAbsoluteDeviation, mean/standardDeviation, zScore, linearRegression — the primitives for robust MAD/z-score/EWMA anomaly baselines run inside the monitor worker (radar Adopt). | https://github.com/simple-statistics/simple-statistics |
| `@stdlib/stats (modular imports)` | stats / distributions | ~5.8k (stdlib monorepo) | Active | Apache-2.0 | yes | jStat (stale) | Rigorous distributions / criticals (e.g. GESD/S-H-ESD critical values, t-tests) for a defensible anomaly threshold beyond naive z-score. Import only the leaf packages to keep bundle small. | https://github.com/stdlib-js/stats |
| `@tanstack/react-virtual` | virtualization | ~5.5k | Very active (v3) | MIT | yes | .slice() truncation | Already in the stack project-wide. Virtualize the alert event log and notification history so they render real (hundreds-to-thousands) alert volumes at 60fps instead of silently slicing to 50/20. | https://github.com/TanStack/virtual |
| `dexie` | offline persistence | ~13k | Active | Apache-2.0 | yes | localStorage JSON persistence | Move alert events + rules + notifications off localStorage into IndexedDB: async (non-blocking), queryable, unbounded, survives. Radar Adopt for many small structured records. | https://github.com/dexie/Dexie.js |
| `node-llama-cpp` | local LLM (Electron main) | ~2.1k | Very active (v3.x, 2026) | MIT | yes | @mlc-ai/web-llm (REJECTED by radar) | Replace @mlc-ai/web-llm for 'Smart Suggestions': runs GGUF q4 on CPU (AVX) with optional GPU offload in the Electron main process, with GBNF/JSON-schema grammars so threshold suggestions return STRUCTURED JSON. Works on the no-WebGPU target where web-llm fails. | https://github.com/withcatai/node-llama-cpp |
| `@huggingface/transformers` | browser inference fallback | ~14-16k | Very active (v4.x) | Apache-2.0 | yes | @mlc-ai/web-llm (browser lane) | If a non-Electron web build needs the AI suggestion path, this gives a WebGPU->WASM-SIMD auto-fallback in a worker (the CPU fallback web-llm lacks). Used as the browser-lane fallback only. | https://github.com/huggingface/transformers.js |
| `date-fns` | date formatting | ~34k | Very active | MIT | yes | inline Intl per row | Replace per-row inline new Date().toLocaleString('fr-FR') Intl allocations with cheap, tree-shaken, memoizable formatters; format() pulled once per render not per row. | https://github.com/date-fns/date-fns |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Add a per-route budget for /dashboard/monitor and a per-worker budget for the new monitor-engine.worker to catch bundle/parse-time regressions (radar Adopt; already in repo). | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Visualize the unnecessary full-tree re-renders caused by the no-selector useMonitorStore() calls so the team can verify the selector/memo fixes actually cut renders. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | library | yes | Microbenchmark the anomaly/rule-evaluation worker (events/sec) to set and protect a perf budget for the hot evaluation path. | https://github.com/tinylibs/tinybench |
| `vitest` | cli | yes | Lock the rule-evaluation + anomaly math behind deterministic unit tests (currently impossible because of Math.random()); run fully offline. | https://github.com/vitest-dev/vitest |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Audit INP/CLS of the monitor route against localhost offline to confirm worker offload keeps the main thread responsive during streaming. | https://github.com/GoogleChrome/lighthouse-ci |
| `knip` | cli | yes | After splitting the 1652-line file into tab components + hooks, detect dead exports / unused helpers left behind. | https://github.com/webpro-nl/knip |

---

## channel-monitor — Deep Improvement Plan

Feature: Real-time channel/stream monitoring + alerts.
Scope read: `src/app/dashboard/monitor/page.tsx` (47 lines), `src/features/channel-monitor/store/monitor-store.ts` (253 lines), `src/features/channel-monitor/screens/ChannelMonitorScreen.tsx` (1652 lines). External touch point: `src/platform/ai/llm-engine.ts` (uses `@mlc-ai/web-llm`).

---

### 1. Current implementation

**Route** — `src/app/dashboard/monitor/page.tsx` is a thin server component exporting `metadata` and a `MonitorSkeleton`, wrapping `<ChannelMonitorScreen/>` in `<Suspense>`. Fine as-is.

**Store** — `src/features/channel-monitor/store/monitor-store.ts` is a single Zustand store (`useMonitorStore`) with `persist` + `createJSONStorage(() => localStorage)`. It holds `alertRules` (3 defaults), `alertEvents` (capped 500 via `slice(0,500)` in `addEvent`), `channelStatuses` (Record), `soundEnabled/soundVolume`, `slaTargets`, `notifications` (capped 50). `partialize` persists rules/events/sound/sla (not statuses/notifications). `testAlert(ruleId)` fabricates one event+notification.

**Screen** — `ChannelMonitorScreen.tsx` is ONE `"use client"` file holding the entire feature:
- Constants: `CHANNELS` (10 hardcoded telecom channels, lines 46-57).
- Synthetic data: `seededRand` (Math.sin hash), `generateChannelStatus` (lines 66-119), `generateAlertEvents` (40 fake events, lines 121-145), `generateDailyCompliance` (30-pt arrays, lines 147-152). **All data is fake.**
- Web Audio: `createOscillatorAlert` builds a NEW `AudioContext` every beep (line 163); `playSoundAlert` schedules beeps via `setTimeout`.
- Color/label helpers (lines 195-244).
- 5 tab components: `ChannelHealthTab` (status board + 30s tick + rule eval + incident modal), `AlertRulesTab` (CRUD form + table + AI suggestions), `AlertTimelineTab` (ECharts scatter + event log + CSV export), `SlaComplianceTab` (ECharts line + scorecard + config modal), `SoundConfigTab` (volume/visual toggles + notification history).
- `ChannelMonitorScreen` root: header + `<Tabs>` shell.

Libraries actually used: `echarts-for-react` (`ReactECharts`), Zustand, design-system UI, `@/features/telecom/lib/format`, and the LLM engine.

---

### 2. Performance bottlenecks & exact fixes

#### 2.1 One giant component + non-selective store subscriptions
Every tab does `const { ... } = useMonitorStore()` with **no selector** (e.g. line 259, 604, 919, 1173, 1421). Zustand without a selector subscribes to the *entire* store, so any mutation (a single `acknowledgeEvent`, a notification push) re-renders all mounted tabs. Because Radix `<Tabs>` mounts only the active `TabsContent`, the worst case is "every store write re-renders the whole active tab + the root unread badge."

Fix — atomic selectors with `useShallow`:
```ts
import { useShallow } from "zustand/react/shallow";

// instead of: const { alertEvents, acknowledgeEvent } = useMonitorStore();
const alertEvents = useMonitorStore((s) => s.alertEvents);
const acknowledgeEvent = useMonitorStore((s) => s.acknowledgeEvent);
// or grouped:
const { soundEnabled, soundVolume } = useMonitorStore(
  useShallow((s) => ({ soundEnabled: s.soundEnabled, soundVolume: s.soundVolume }))
);
```
Split the file: `screens/ChannelMonitorScreen.tsx` (shell only) + `tabs/{ChannelHealthTab,AlertRulesTab,AlertTimelineTab,SlaComplianceTab,SoundConfigTab}.tsx` + `lib/{simulate.ts,audio.ts,format-helpers.ts}` + `hooks/useMonitorEngine.ts`. Lazy-load non-default tabs with `next/dynamic` so ECharts only loads when the timeline/SLA tab opens.

#### 2.2 O(events²) scatter rebuild (AlertTimelineTab)
Lines 955-1019: `scatterData` maps `filtered`, then three series each call `scatterData.filter(d => { const ev = alertEvents.find(e => e.id === d[3]); ... })`. That is `find()` (O(n)) inside `filter()` (O(n)) three times → O(n²) per render, plus the whole `scatterOption` object is rebuilt every render (not memoized).

Fix — bucket once, memoize the option:
```ts
const seriesData = useMemo(() => {
  const bySev = { info: [] as number[][], warning: [] as number[][], critical: [] as number[][] };
  for (const e of filtered) {
    const y = e.severity === "critical" ? 3 : e.severity === "warning" ? 2 : 1;
    bySev[e.severity].push([new Date(e.triggeredAt).getTime(), y]);
  }
  return bySev;
}, [filtered]);

const scatterOption = useMemo(() => ({ /* ...uses seriesData... */ }), [seriesData]);
```
Single O(n) pass; option referentially stable so ECharts skips re-setOption.

#### 2.3 Main-thread rule evaluation on every tick
Lines 267-320: a `useEffect([tick])` regenerates all statuses, then nested-loops `alertRules × CHANNELS`, evaluating conditions, and uses `Math.random() < 0.05` (line 291) to randomly fire. Problems: (a) runs on the renderer main thread; (b) only runs while `ChannelHealthTab` is mounted — alerts stop when you switch tabs; (c) `Math.random()` makes it non-deterministic/untestable; (d) evaluation is coupled to the synthetic generator.

Fix — move evaluation into a Comlink worker driven by a top-level hook (see §4.2) that runs regardless of active tab, and make firing deterministic (debounce per rule+channel with `lastTriggered`, not RNG).

#### 2.4 ECharts on the renderer main thread
`ReactECharts` (timeline + SLA) renders synchronously on the main thread. On a 4-core iGPU box, a 6-series animated line plus a scatter compete with interaction. Two fixes: (1) for the dense, frequently-updating per-channel sparklines, use **uPlot** (10% CPU vs 70%); (2) keep ECharts for the categorical scatter/SLA but enable OffscreenCanvas worker rendering where supported (ECharts supports `init(canvas, null, { ssr:false })` against a transferred `OffscreenCanvas`). At minimum, gate animations off (`animation:false`) for streaming charts.

#### 2.5 No virtualization
Event log slices to 50 (line 1109), notifications to 20 (line 1559). Real volumes need windowing, not truncation. Use `@tanstack/react-virtual`:
```tsx
const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: filtered.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 56,
  overscan: 12,
});
return (
  <div ref={parentRef} className="max-h-96 overflow-y-auto">
    <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const ev = filtered[vi.index];
        return <EventRow key={ev.id} ev={ev} style={{ position:"absolute", top:0, transform:`translateY(${vi.start}px)` }} />;
      })}
    </div>
  </div>
);
```

#### 2.6 Synchronous localStorage persistence of unbounded history
`persist` serializes the whole partialized store (up to 500 events) to a JSON string on EVERY mutation. Each ack/add blocks the main thread on `JSON.stringify`. Move events/notifications to Dexie (async IndexedDB); keep only small config (rules, sound, sla) in `persist`. See §3.

#### 2.7 Per-row Intl allocation
`new Date(...).toLocaleString("fr-FR")` is called inline per event row (1138, 1144), per notification (1571), and `lastUpdated` per render (345). Use a single memoized `date-fns` formatter or one shared `Intl.DateTimeFormat` instance:
```ts
const FR = new Intl.DateTimeFormat("fr-FR", { dateStyle:"short", timeStyle:"short" });
// FR.format(ts) — formatter allocated once, reused.
```

#### 2.8 Background work never pauses
`setInterval(30_000)` (line 323) keeps ticking when the window/tab is hidden, and can play audio in the background. Gate with the Page Visibility API and only run the engine when `document.visibilityState === "visible"` (or, for true monitoring, run in a worker and surface OS notifications when hidden — §4.3).

---

### 3. Offline gaps & how to close them

| Gap | Current | Fix |
|---|---|---|
| AI suggestions need WebGPU | `llm-engine.ts` imports `@mlc-ai/web-llm` (line 78), WebGPU-only, no CPU fallback (radar REJECT) | Electron lane: `node-llama-cpp` GGUF q4 in main + GBNF JSON-schema grammar for structured thresholds. Browser lane: `@huggingface/transformers` WASM-SIMD fallback in a worker. |
| Data is fake | `seededRand` synthetic generators | Wire to on-device DuckDB (`src/core/queries/duckdb.ts useDuckDBQuery`) — aggregate real channel metrics in SQL, stream Arrow. Keep simulator behind a `MONITOR_DEMO` flag. |
| localStorage persistence | `createJSONStorage(localStorage)` | Dexie/IndexedDB for events+notifications; `persist` only for small config. |
| No OS alerts when hidden | in-app Zustand array only | Electron main-process `Notification` (preferred) or Web `Notification` API — fully offline. |
| AudioContext per beep | new `AudioContext()` each call | One module-level `AudioContext`, unlocked on first user gesture, `resume()` then reuse. |
| Alerts only while tab mounted | eval in `ChannelHealthTab` effect | Engine runs in worker/top-level hook independent of UI. |
| No baseline/anomaly | static thresholds only | In-worker EWMA + MAD/z-score + CUSUM using `simple-statistics`/`@stdlib/stats`. |

**LLM fix sketch (Electron, structured + offline):**
```ts
// main process
import { getLlama, LlamaChatSession } from "node-llama-cpp";
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: resolveBundledGguf("Qwen2.5-1.5B-Instruct-Q4_K_M.gguf") });
const grammar = await llama.createGrammarForJsonSchema({
  type: "object",
  properties: {
    successRateBelow: { type: "number" }, volumeAbove: { type: "number" }, failuresAbove: { type: "number" },
    rationale: { type: "string" },
  }, required: ["successRateBelow","volumeAbove","failuresAbove"],
});
const session = new LlamaChatSession({ contextSequence: (await model.createContext()).getSequence() });
const json = await session.promptWithMeta(prompt, { grammar });
// renderer calls this via the existing contextBridge IPC channel — no network.
```

---

### 4. Better architecture & implementation

```
src/features/channel-monitor/
  screens/ChannelMonitorScreen.tsx      // shell + Tabs only
  tabs/ChannelHealthTab.tsx
  tabs/AlertRulesTab.tsx
  tabs/AlertTimelineTab.tsx
  tabs/SlaComplianceTab.tsx
  tabs/SoundConfigTab.tsx
  components/ChannelCard.tsx, EventRow.tsx (virtualized), SparklineCell.tsx (uPlot)
  hooks/useMonitorEngine.ts             // top-level, owns the worker + interval
  workers/monitor-engine.worker.ts      // Comlink: pull metrics, eval rules, anomaly detect
  lib/anomaly.ts                        // EWMA/MAD/CUSUM (simple-statistics)
  lib/audio.ts                          // singleton AudioContext
  lib/notify.ts                         // Electron/Web Notification bridge
  data/metrics-source.ts                // DuckDB-backed; demo simulator behind flag
  store/monitor-store.ts                // config in persist; events/notifications via Dexie
  db/monitor-db.ts                      // Dexie schema
```

#### 4.1 Dexie schema
```ts
import Dexie, { type Table } from "dexie";
class MonitorDB extends Dexie {
  events!: Table<AlertEvent, string>;
  notifications!: Table<NotificationEntry, string>;
  constructor() {
    super("channel-monitor");
    this.version(1).stores({
      events: "id, triggeredAt, severity, channel, acknowledged",
      notifications: "id, timestamp, read",
    });
  }
}
export const monitorDb = new MonitorDB();
// live query for the timeline (auto-updates, no manual subscribe):
import { liveQuery } from "dexie";
export const recentEvents$ = liveQuery(() =>
  monitorDb.events.orderBy("triggeredAt").reverse().limit(2000).toArray());
```

#### 4.2 Engine worker (Comlink)
```ts
// monitor-engine.worker.ts
import * as Comlink from "comlink";
import { detectAnomalies, evaluateRules } from "./engine-core";
const api = {
  async tick(input: { statuses: ChannelStatus[]; rules: AlertRule[]; history: Map<string, number[]> }) {
    const fired = evaluateRules(input.statuses, input.rules);       // deterministic
    const anomalies = detectAnomalies(input.statuses, input.history); // EWMA/MAD
    return { fired, anomalies };
  },
};
Comlink.expose(api);
```
```ts
// hooks/useMonitorEngine.ts — runs once at the screen root, not per tab
export function useMonitorEngine() {
  const rules = useMonitorStore((s) => s.alertRules);
  const apiRef = useRef<Comlink.Remote<EngineApi>>();
  useEffect(() => {
    const worker = new Worker(new URL("../workers/monitor-engine.worker.ts", import.meta.url), { type: "module" });
    apiRef.current = Comlink.wrap<EngineApi>(worker);
    let id: number;
    const loop = async () => {
      if (document.visibilityState === "visible") {
        const statuses = await fetchMetrics();                 // DuckDB or simulator
        const { fired } = await apiRef.current!.tick({ statuses, rules, history: getHistory() });
        for (const ev of fired) { persistEvent(ev); maybeNotify(ev); maybePlaySound(ev); }
      }
      id = window.setTimeout(loop, 30_000);
    };
    loop();
    return () => { window.clearTimeout(id); worker.terminate(); };
  }, [rules]);
}
```

#### 4.3 Anomaly core (offline, deterministic)
```ts
import { medianAbsoluteDeviation, mean, standardDeviation } from "simple-statistics";
export function robustZScore(series: number[], x: number) {
  const med = series.slice().sort((a,b)=>a-b)[series.length>>1];
  const mad = medianAbsoluteDeviation(series) || 1e-9;
  return 0.6745 * (x - med) / mad;            // |z| > 3.5 ⇒ anomaly
}
export function ewma(prev: number, x: number, alpha = 0.3) { return alpha*x + (1-alpha)*prev; }
// CUSUM for sustained shift:
export function cusum(series: number[], k = 0.5) {
  const m = mean(series), s = standardDeviation(series) || 1e-9; let hi=0, lo=0, hit=false;
  for (const x of series) { const z=(x-m)/s; hi=Math.max(0,hi+z-k); lo=Math.min(0,lo+z+k);
    if (hi>4 || lo<-4) hit=true; } return hit;
}
```

#### 4.4 Audio singleton + OS notify
```ts
// lib/audio.ts
let ctx: AudioContext | null = null;
export function unlockAudio() { ctx ??= new AudioContext(); if (ctx.state==="suspended") ctx.resume(); }
export function beep(freq:number, dur:number, vol:number) {
  if (!ctx) return; const o=ctx.createOscillator(), g=ctx.createGain();
  o.connect(g); g.connect(ctx.destination); o.frequency.value=freq;
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
  o.start(); o.stop(ctx.currentTime+dur);
}
// lib/notify.ts
export function notify(title:string, body:string) {
  if (window.electron?.notify) return window.electron.notify(title, body); // main process
  if (Notification?.permission === "granted") new Notification(title, { body });
}
```

#### 4.5 Real metrics via DuckDB
```ts
// data/metrics-source.ts
export async function fetchMetrics(): Promise<ChannelStatus[]> {
  if (DEMO) return simulate();
  const rows = await runDuckDB(`
    SELECT channel,
           100.0*SUM(success)/COUNT(*) AS success_rate,
           COUNT(*) FILTER (WHERE ts > now() - INTERVAL 1 MINUTE) AS txn_per_min,
           SUM(amount) AS amount_today,
           COUNT(*) FILTER (WHERE NOT success) AS failure_count
    FROM transactions WHERE ts::date = today() GROUP BY channel`);
  return rows.map(toChannelStatus);
}
```
Push aggregation to SQL; never materialize raw rows in JS.

---

### 5. CLIs & tools (all offline)
- `size-limit` with a per-route budget for `/dashboard/monitor` and a per-worker budget for `monitor-engine.worker`.
- `react-scan` to verify selector/memo fixes reduce re-renders.
- `vitest` + `tinybench` to lock anomaly math (now deterministic) and benchmark events/sec in the worker.
- `@lhci/cli` to confirm INP stays low while streaming.
- `knip` to clean dead helpers after the file split.

---

### 6. Phased tasks

**P1 — correctness & offline-safety (highest impact)**
1. Replace `@mlc-ai/web-llm` suggestion path with `node-llama-cpp` (Electron) + JSON-schema grammar; `@huggingface/transformers` browser fallback. Remove the silent string fallback as the only behavior.
2. Make rule evaluation deterministic (drop `Math.random()` at line 291; debounce per rule+channel via `lastTriggered`). Add Vitest tests.
3. Singleton, gesture-unlocked `AudioContext`; add OS Notification bridge for backgrounded alerts.
4. Add atomic Zustand selectors (`useShallow`) to every tab.

**P2 — performance & scale**
5. Split the 1652-line file into tabs/hooks/lib; lazy-load ECharts tabs.
6. Move evaluation+anomaly into a Comlink worker via `useMonitorEngine` at the screen root (runs regardless of active tab; Page-Visibility gated).
7. Virtualize event log + notifications with `@tanstack/react-virtual`.
8. Fix O(n²) scatter (bucket once, memoize `scatterOption`); memoize SLA option; dedupe `generateDailyCompliance`.
9. Add uPlot per-channel sparklines for live success-rate/volume.
10. Move events/notifications to Dexie; shrink `persist` to config only. Shared `Intl`/date-fns formatters.

**P3 — depth**
11. EWMA/MAD/CUSUM anomaly baselines surfaced as a new "Anomalies" panel.
12. Wire real DuckDB metrics behind a `MONITOR_DEMO` flag.
13. OffscreenCanvas worker rendering for ECharts where supported; budgets in CI via size-limit + LHCI.

Sources: https://github.com/leeoniya/uPlot , https://github.com/simple-statistics/simple-statistics , https://github.com/apache/echarts/issues/9232 , https://github.com/withcatai/node-llama-cpp , https://github.com/dexie/Dexie.js , https://github.com/TanStack/virtual