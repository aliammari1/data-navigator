# Feature Plan — ux-innovations

**Maturity:** partial

## Performance issues

- AchievementSystem.tsx is a single 2,320-line client component with no code-splitting or lazy import — it ships react-confetti-boom + ~50 lucide icons + 4 full tab views (achievements grid, leaderboard, stats heatmap, activity feed) to the main bundle even though it is never rendered (no route imports it).
- No memoization anywhere: getLevelInfo, ACHIEVEMENTS.filter, completionPct, the [...LEADERBOARD_DATA].sort() in LeaderboardTab, and categoryStats in StatsTab all recompute on every render. Sorting and array spreads run synchronously in render bodies, not in useMemo.
- useAchievementsStore reads localStorage synchronously in an effect and calls getAllWithStatus()/getPoints()/getTotalPoints() three times (each re-parses the same JSON blob), then triggers a second render. Every unlock() re-parses + re-serializes the whole localStorage blob.
- achievements-store.ts re-reads and JSON.parses localStorage on EVERY accessor call (isUnlocked, getPoints, getUnlockedAchievements, getRecentAchievements each call loadUnlocked() independently) — O(n) parse per call, multiplied across the render tree.
- Confetti via react-confetti-boom renders on the main-thread canvas with particleCount=130; it does not use OffscreenCanvas/Worker, so the burst competes with React reconciliation and any concurrent DuckDB/chart work, dropping frames on integrated GPUs.
- react-joyride v3 (OnboardingTour) injects a full-viewport overlay + portal and runs continuous DOM measurement/reposition on scroll/resize via getBoundingClientRect on every step transition; it is heavier than needed for a static sidebar walkthrough.
- Achievements grid (filtered.map) and activity feed (ACTIVITY_EVENTS.map) render every item with no virtualization — fine at current ~30 items but the design implies growth (events log capped at 200, leaderboards, unlock timeline) with no windowing strategy.
- Two parallel sources of truth for unlocked state (the localStorage store via getAllWithStatus AND the in-component unlockedIds Set seeded from UNLOCK_TIMELINE) are merged on mount and diverge after demo unlocks, causing redundant state and re-renders plus inconsistent XP math.

## Offline gaps

- LEADERBOARD_DATA, ACTIVITY_EVENTS, WHO_HAS, PERSONAL_STATS, HEATMAP_DATA and UNLOCK_TIMELINE are all hardcoded fake multi-user data (Sarah Chen, Mohamed Trabelsi, etc.). The 'Leaderboard' and 'Recent Activity' tabs imply a multi-user/social backend that does not and cannot exist offline — they are pure mock UI with no real data source.
- The 'Team Player'/'collaboration' achievement and leaderboard concept presuppose a shared server. Offline-only means there is no cross-user ranking; this must either become single-user (personal-best history) or use the project's LAN-only Yjs/Hocuspocus collab substrate, not an implied cloud.
- Achievement progress values (current/max on century-club, thousand-rows, csv-master, etc.) are hardcoded constants, not wired to real app telemetry. There is no offline event bus connecting actual user actions (CSV import, forecast run, export) to achievement unlocks — so the gamification reflects nothing real.
- Persistence is localStorage only. localStorage is small (~5MB), synchronous (main-thread blocking on large blobs), and not shared with the Electron main process. The events log (capped at 200) and unlock state should live in Dexie/IndexedDB (per Tech Radar Domain 1) for durability and worker access.
- OnboardingTour targets routes (/dashboard/ai-briefing, /dashboard/forecast, /dashboard/geo-analysis, etc.) that are not in the current git tree (routes are telecom-report/browser) — the tour points at non-existent selectors, so steps will silently fail to anchor when run.
- No navigator.storage.persist() call exists to protect the localStorage/IDB data from eviction, so achievement progress can be silently wiped by the browser/OS under storage pressure.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `driver.js` | Onboarding / product tour (replace react-joyride) | 25.7k | Active — v1.4.0 Nov 2025, 534 commits, responsive maintainer (kamranahmedse) | MIT | yes | react-joyride | Zero-dependency, ~5kB gzip spotlight tour engine vs react-joyride's heavier overlay+portal. TypeScript, framework-agnostic, no network. 5x the stars of react-joyride and far smaller. Wrap in a thin React hook for the sidebar walkthrough. | https://github.com/kamranahmedse/driver.js |
| `canvas-confetti` | Celebration FX (replace react-confetti-boom) | 12.6k | Active — v1.9.4 Oct 2025 | ISC | yes | react-confetti-boom | De-facto confetti lib with a built-in useWorker:true OffscreenCanvas path that renders OFF the main thread — directly fixes the frame-drop bottleneck of react-confetti-boom. ISC permissive, ~6kB, no deps. ~3.9M weekly downloads. | https://github.com/catdad/canvas-confetti |
| `dexie` | Local persistence for achievement/event state | 13k | Active | Apache-2.0 | yes | localStorage accessors in achievements-store.ts | Tech Radar ADOPT. Replace synchronous localStorage with IndexedDB for the unlock log + event stream: async, larger quota, worker-accessible, survives with navigator.storage.persist(). One keyed table for unlocks plus an append-only events store. | https://github.com/dexie/Dexie.js |
| `motion (framer-motion)` | Animation for tour/cards/toasts | 28k+ | Very active | MIT | yes | ad-hoc tailwind animate-in usage | ALREADY a dependency (motion ^12.40 in package.json). Use it for the AchievementToast slide-in, card unlock flips, and step transitions instead of ad-hoc CSS animate-in classes — consolidate, don't add. No new dep. | https://github.com/motiondivision/motion |
| `zustand` | State store for achievements (replace bespoke hook) | 49k+ | Very active | MIT | yes | useAchievementsStore compat shim + in-component unlockedIds state | ALREADY used across src/core/stores (chart-store, data-store, settings-store). Replace the bespoke useAchievementsStore + dual unlockedIds Set with one zustand store + persist middleware (Dexie/IDB adapter), giving a single source of truth and selector-based re-render isolation. No new dep. | https://github.com/pmndrs/zustand |
| `@tanstack/react-virtual` | List virtualization (leaderboard/activity/grid) | 5.5k | Very active | MIT | yes | unbounded .map() lists | Tech Radar ADOPT and already in the stack. Window the activity feed, leaderboard, and achievements grid if they grow past a few hundred rows. Headless, tiny, pairs with existing TanStack usage. No new dep. | https://github.com/TanStack/virtual |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@next/bundle-analyzer` | cli | yes | Confirm AchievementSystem.tsx + react-confetti-boom + lucide icon set are not in the initial route chunk; verify the lazy-import split lands them in an async chunk. | https://github.com/vercel/next.js |
| `size-limit (+@size-limit/preset-app)` | cli | yes | Tech Radar Domain 10. Add a per-component/per-route budget for the achievements bundle so confetti/icons regressions fail CI offline. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect the unnecessary re-renders in the 4-tab achievement tree (unmemoized sorts/filters) during dev, fully offline. | https://github.com/aidenybai/react-scan |
| `knip` | cli | yes | Flags AchievementSystem/OnboardingTour as currently UNUSED (no route imports them) and surfaces the dead WHO_HAS/PERSONAL_STATS exports — confirms the mock-data dead code. | https://github.com/webpro-nl/knip |
| `axe-core (vitest-axe / @axe-core/playwright)` | library | yes | Tour overlays, modal focus traps, and progress dots need a11y validation; run locally against bundled Chromium. | https://github.com/dequelabs/axe-core |

---

## ux-innovations — Deep Improvement Plan

### 0. TL;DR

The `ux-innovations` feature is **three files, ~2,720 lines, and currently dead code** — nothing in `src/app` imports either component. It is a *demo/showcase* of gamification (`AchievementSystem.tsx`, 2,320 lines) and onboarding (`OnboardingTour.tsx`, 282 lines) backed by a tiny localStorage store (`achievements-store.ts`, 118 lines). The bones are reasonable and offline-friendly, but the implementation is **~80% hardcoded fake data** (fake leaderboard users, fake activity feed, fake progress bars, fake heatmap) and **0% wired to real app events**. The two biggest problems are:

1. **It pretends to be multi-user/social** (leaderboard, "Sarah Chen unlocked Data Titan", who-also-has) which is impossible offline and must be reframed as single-user personal-progress (or wired to the existing LAN-only Yjs collab substrate).
2. **It is a monolithic, unmemoized, non-lazy client component** that — once it IS mounted — will ship confetti + 50 icons + 4 tab views eagerly and re-sort/re-filter on every render.

The fix is mostly **deletion, consolidation onto deps already in the project (zustand, motion, Dexie, TanStack Virtual), one small swap (react-joyride → driver.js, react-confetti-boom → canvas-confetti with worker rendering), and a real offline event bus** that connects actual user actions to achievement unlocks.

---

### 1. Current implementation (file-by-file)

#### 1.1 `src/features/ux-innovations/store/achievements-store.ts` (118 lines)

A plain-function module over `localStorage` with two keys: `achievements:unlocked` (`Record<id, ISOdate>`) and `achievements:events` (append-only, capped at 200). Exposes `checkAndUnlock`, `isUnlocked`, `getPoints`, `getUnlockedAchievements`, `getAllWithStatus`, `getRecentAchievements`, `getTotalPoints`. `ALL_ACHIEVEMENTS` is a 15-item array.

**Problem:** every accessor independently calls `loadUnlocked()`, which does `JSON.parse(localStorage.getItem(...))`. So one render that calls `getAllWithStatus()` + `getPoints()` + `getTotalPoints()` parses the same blob **three times** synchronously on the main thread. There is no caching, no reactivity (callers must manually `refresh()`), and no durability guarantee (`localStorage` is evictable and synchronous).

#### 1.2 `src/features/ux-innovations/components/AchievementSystem.tsx` (2,320 lines)

A single `"use client"` component. Key structures:

- `useAchievementsStore()` (lines 71–95): a compatibility shim that wraps the plain-function store into React state. On mount it sets three state values from the store (triggering an extra render). `unlock()` writes to localStorage then `refresh()`.
- `ACHIEVEMENTS: AchievementDef[]` (lines 155–~619): ~30 hardcoded achievement definitions across 6 categories, **with hardcoded `progress: {current, max}`** (e.g. `century-club` is frozen at `67/100`).
- `getLevelInfo(xp)` (621): pure level math over a `LEVELS` table (Bronze→Diamond).
- `LEADERBOARD_DATA` (632–714): **8 fake users** with names, XP, levels, avatars. "Ali Ammari" is flagged `isCurrentUser`.
- `ACTIVITY_EVENTS` (718–~855): **fake social feed** ("Sarah Chen unlocked Data Titan 2h ago").
- `PERSONAL_STATS`, `HEATMAP_DATA` (49 fake intensity cells), `UNLOCK_TIMELINE` (10 fake unlocks), `WHO_HAS` (fake "who also has this") — all hardcoded (858–901).
- Tab components: `LeaderboardTab` (1393) does `[...LEADERBOARD_DATA].sort(...)` **in the render body**; `StatsTab` (1561) computes `categoryStats = CATEGORIES.map(...)` in render; `ActivityTab` (1806); plus `AchCard`, `AchievementModal`, `AchievementToast`, `LevelBadge`.
- `AchievementSystem()` (1939): the page. Holds confetti/toast/modal/claimed state. Crucially keeps **two sources of truth**: `unlockedIds` (a `Set` seeded from `UNLOCK_TIMELINE` + store) and the store itself. `handleDemoUnlock` and `handleClaim` use `setTimeout(... 3500)` to clear confetti.
- Confetti (2040): `<ConfettiBoom particleCount={130} .../>` rendered into a fixed full-screen overlay, **main-thread canvas**.

#### 1.3 `src/features/ux-innovations/components/OnboardingTour.tsx` (282 lines)

`react-joyride` v3 tour with 8 hardcoded `TOUR_STEPS` targeting sidebar links (`[href="/dashboard/ai-briefing"]`, `/forecast`, `/geo-analysis`, `/analytics-theater`, `/monitor`, `/collaborative`). A `CustomTooltip`, a first-visit floating welcome card, and a `compact` trigger. Completion is tracked in `localStorage` (`tour:completed`).

**Problem:** several target routes (`ai-briefing`, `forecast`, `geo-analysis`, `analytics-theater`, `monitor`, `collaborative`) **do not exist** in the current tree (the routes present are `telecom-report/*` and `browser`). The tour will fail to anchor those steps.

#### 1.4 Consumption

`grep` across `src/app`, `src/components`, `src/design`, `src/shared` finds **no importers**. `AchievementSystem` imports the store; `OnboardingTour` is standalone. So this whole feature is currently **unreferenced dead code** — `knip` would flag it. That's actually convenient: we can restructure aggressively without breaking routes.

---

### 2. Performance bottlenecks & exact fixes

#### 2.1 Monolith is eagerly bundled — lazy-load + split

2,320 lines + `react-confetti-boom` + ~50 `lucide-react` icons in one chunk is a large parse/eval cost the moment any route imports it. Split into a dynamic island and move the four tabs behind `React.lazy`.

```tsx
// src/features/ux-innovations/components/AchievementSystem.tsx (shell only)
import dynamic from "next/dynamic";

const LeaderboardTab = dynamic(() => import("./tabs/LeaderboardTab"), { ssr: false });
const StatsTab       = dynamic(() => import("./tabs/StatsTab"),       { ssr: false });
const ActivityTab    = dynamic(() => import("./tabs/ActivityTab"),    { ssr: false });
// confetti only loaded when a claim happens:
const Celebrate = dynamic(() => import("./Celebrate"), { ssr: false });
```

And let the *page* that hosts it import the whole feature lazily:

```tsx
const AchievementSystem = dynamic(
  () => import("@/features/ux-innovations/components/AchievementSystem"),
  { ssr: false, loading: () => <AchievementsSkeleton /> },
);
```

Verify with `@next/bundle-analyzer` + `size-limit` that the achievements code lands in an async chunk, not the route's first load JS.

#### 2.2 Confetti blocks the main thread — swap to worker-rendered canvas-confetti

`react-confetti-boom` renders on the main-thread canvas. `canvas-confetti` has a built-in `useWorker: true` (OffscreenCanvas) path. This is the single biggest FPS lever for the celebration moment, especially on integrated GPUs where DuckDB/charts may be busy.

```tsx
// src/features/ux-innovations/components/Celebrate.tsx
"use client";
import { useEffect } from "react";
import confetti from "canvas-confetti";

export default function Celebrate({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const myConfetti = confetti.create(undefined, { resize: true, useWorker: true });
    myConfetti({
      particleCount: 130, spread: 85, origin: { y: 0.3 },
      colors: ["#fbbf24","#f59e0b","#3b82f6","#10b981","#8b5cf6","#ec4899","#06b6d4"],
    });
    const t = setTimeout(onDone, 2500);
    return () => { clearTimeout(t); myConfetti.reset(); };
  }, [onDone]);
  return null; // canvas-confetti manages its own canvas
}
```

This removes the `<ConfettiBoom>` fixed overlay div entirely and runs particles off-thread.

#### 2.3 Unmemoized sorts/filters in render bodies

`LeaderboardTab` sorts on every render; `StatsTab` maps categories on every render; the page recomputes `filtered`, `totalXP`, `completionPct` inline. Memoize:

```tsx
const sorted = useMemo(
  () => [...rows].sort((a, b) => SORTERS[sort](a, b)),
  [rows, sort],
);
const filtered = useMemo(
  () => ACHIEVEMENTS.filter(a => categoryFilter === "ALL" || a.category === categoryFilter),
  [categoryFilter],
);
const totalXP = useMemo(
  () => defs.reduce((s, a) => unlocked.has(a.id) ? s + a.xp : s, 0),
  [defs, unlocked],
);
```

#### 2.4 Store re-parses localStorage N times per render — cache + reactive store

Replace the plain-function store + `useAchievementsStore` shim + dual `unlockedIds` `Set` with **one zustand store** (already a project dependency) using `persist` over an async IndexedDB/Dexie storage adapter. Selectors give per-slice re-render isolation, and the JSON blob is parsed once into memory.

```ts
// src/features/ux-innovations/store/achievements-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { dexieStorage } from "@/core/storage/dexie-storage"; // StateStorage over Dexie

interface AchState {
  unlocked: Record<string, string>;          // id -> ISO date
  events: { id: string; ts: string }[];      // append-only, capped
  unlock: (id: string) => boolean;
}

export const useAchievements = create<AchState>()(
  persist(
    (set, get) => ({
      unlocked: {},
      events: [],
      unlock: (id) => {
        if (get().unlocked[id]) return false;
        const ts = new Date().toISOString();
        set((s) => ({
          unlocked: { ...s.unlocked, [id]: ts },
          events: [...s.events, { id, ts }].slice(-200),
        }));
        return true;
      },
    }),
    { name: "achievements", storage: createJSONStorage(() => dexieStorage) },
  ),
);

// derived selectors (memoized by zustand subscription identity)
export const selectXP = (s: AchState) =>
  ACHIEVEMENTS.reduce((sum, a) => (s.unlocked[a.id] ? sum + a.xp : sum), 0);
```

Components subscribe narrowly: `const xp = useAchievements(selectXP)` — only re-renders when XP changes, not on every event push.

#### 2.5 Lists: virtualize only if they grow

At ~30 items, virtualization is premature. But the event log is capped at 200 and the design implies growth. Gate windowing behind a threshold using the already-present `@tanstack/react-virtual`:

```tsx
const useVirtual = events.length > 100;
return useVirtual ? <VirtualFeed rows={events} /> : <PlainFeed rows={events} />;
```

#### 2.6 Tour: lighter engine

`react-joyride` does continuous `getBoundingClientRect` measurement and ships a portal+overlay. For a sidebar walkthrough, `driver.js` (5kB, zero deps) is lighter and its spotlight popover repositions only on step change. See §4.3.

---

### 3. Offline gaps & how to close them

#### 3.1 The leaderboard/activity feed are impossible offline — reframe

`LEADERBOARD_DATA` and `ACTIVITY_EVENTS` are **fake multi-user social data**. Offline-only means there is no cloud ranking service. Two honest options:

- **Option A (recommended default): single-user personal progress.** Drop the cross-user leaderboard entirely. Replace the "Leaderboard" tab with a **personal-best / level-progression** view (XP over time, streaks, fastest unlocks) computed from the real local event log. Replace "Recent Activity" with **your own** unlock history (already available in the events store).
- **Option B (LAN team mode): wire to the existing Yjs/Hocuspocus substrate.** The Tech Radar (Domain 8) already prescribes Yjs + `y-protocols` Awareness + a Hocuspocus hub in Electron main for LAN-only collaboration. A *real* offline leaderboard is feasible as a LAN feature: each peer publishes `{name, xp, topAchievement}` into a shared `Y.Map`, presence via Awareness. This is the only legitimate way to have a multi-user board with no cloud. Keep it behind a "Team mode" flag and the existing collab feature.

```ts
// Option B sketch — LAN leaderboard over Yjs (no cloud)
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

const board = ydoc.getMap<{ name: string; xp: number; top: string }>("leaderboard");
function publishMyScore(name: string, xp: number, top: string) {
  board.set(localPeerId, { name, xp, top }); // CRDT-merged across LAN peers
}
const entries = () => [...board.values()].sort((a, b) => b.xp - a.xp);
```

Either way, **delete `LEADERBOARD_DATA`, `ACTIVITY_EVENTS`, `WHO_HAS`, `PERSONAL_STATS`, `HEATMAP_DATA`, `UNLOCK_TIMELINE`** as hardcoded fixtures. `knip` confirms several are dead-data exports.

#### 3.2 Achievements reflect nothing — build a local event bus

The hardcoded `progress: {current, max}` and the demo-only `handleDemoUnlock` mean nothing real triggers unlocks. Close this with a tiny **offline event bus** that real features emit into, and a rules engine that checks unlock conditions. All in-process, no network.

```ts
// src/features/ux-innovations/events/achievement-bus.ts
type AppEvent =
  | { type: "csv.imported"; rows: number }
  | { type: "forecast.run" }
  | { type: "export.created"; format: "csv" | "pdf" | "xlsx" | "pptx" | "docx" }
  | { type: "anomaly.found" }
  | { type: "ai.insight.generated" }
  | { type: "geo.viewed" };

const counters = new Map<string, number>();           // persisted to Dexie
const listeners = new Set<(e: AppEvent) => void>();

export function emitAchievementEvent(e: AppEvent) {
  for (const l of listeners) l(e);
  evaluateRules(e);                                    // see below
}

// Rules map app events -> achievement ids with thresholds
const RULES = [
  { id: "first-upload",  when: (e: AppEvent) => e.type === "csv.imported" },
  { id: "century-club",  counter: "rows", inc: (e: AppEvent) => e.type === "csv.imported" ? e.rows : 0, at: 100 },
  { id: "thousand-rows", counter: "rows", at: 1000 },
  { id: "data-titan",    counter: "rows", at: 10000 },
  { id: "prophet",       when: (e: AppEvent) => e.type === "forecast.run" },
  { id: "csv-master",    counter: "csvExports", inc: (e: AppEvent) => e.type === "export.created" && e.format === "csv" ? 1 : 0, at: 10 },
];

function evaluateRules(e: AppEvent) {
  const { unlock } = useAchievements.getState();
  for (const r of RULES) {
    if (r.when?.(e)) { unlock(r.id); continue; }
    if (r.counter) {
      const add = r.inc?.(e) ?? 0;
      if (add) {
        const next = (counters.get(r.counter) ?? 0) + add;
        counters.set(r.counter, next);
        if (next >= r.at) unlock(r.id);
      }
    }
  }
}
```

Then real features call it where the work actually happens, e.g. in `src/core/queries/files.ts` after a CSV import: `emitAchievementEvent({ type: "csv.imported", rows })`. Progress bars read from `counters` (persisted), not constants.

#### 3.3 Persistence: localStorage → Dexie/IndexedDB + persist()

`localStorage` is synchronous (blocks main thread), small, and evictable. Move unlocks + the (capped) event log + counters into Dexie (Tech Radar ADOPT). Call `navigator.storage.persist()` once at app startup to resist eviction. Provide a zustand `StateStorage` adapter so the store transparently persists:

```ts
// src/core/storage/dexie-storage.ts
import Dexie from "dexie";
import type { StateStorage } from "zustand/middleware";

const db = new Dexie("ux"); db.version(1).stores({ kv: "&key" });
export const dexieStorage: StateStorage = {
  getItem: async (k) => (await db.table("kv").get(k))?.value ?? null,
  setItem: async (k, value) => { await db.table("kv").put({ key: k, value }); },
  removeItem: async (k) => { await db.table("kv").delete(k); },
};
```

#### 3.4 Tour targets non-existent routes

Update `TOUR_STEPS` to the routes that actually exist (`/dashboard/telecom-report/*`, `/dashboard/browser`) or derive targets from the real nav config so the tour can't drift. Add a guard that skips a step whose target is missing:

```ts
const present = (sel: string) => sel === "body" || !!document.querySelector(sel);
const steps = TOUR_STEPS.filter(s => present(s.target as string));
```

---

### 4. Better architecture & implementation (step-by-step)

#### 4.1 Directory shape

```
src/features/ux-innovations/
  store/achievements-store.ts        // zustand + persist (Dexie)
  events/achievement-bus.ts          // emitAchievementEvent + rules engine
  events/rules.ts                    // declarative RULES table
  data/achievements.ts               // ACHIEVEMENTS defs ONLY (no fake users)
  data/levels.ts                     // LEVELS table + getLevelInfo
  components/AchievementSystem.tsx    // thin shell, lazy tabs
  components/Celebrate.tsx           // canvas-confetti worker burst
  components/tabs/AchievementsTab.tsx
  components/tabs/ProgressTab.tsx     // replaces Stats (personal, real data)
  components/tabs/HistoryTab.tsx      // replaces Activity (own unlock log)
  components/tabs/TeamTab.tsx         // OPTIONAL Yjs LAN leaderboard, flagged
  components/AchievementModal.tsx
  components/AchievementToast.tsx
  components/LevelBadge.tsx
  onboarding/useTour.ts              // driver.js hook
  onboarding/tour-steps.ts           // derived from nav config
  onboarding/WelcomeCard.tsx
```

This breaks the 2,320-line file into ~10 small files (each lazy where possible), removes all fake fixtures, and gives a single reactive store.

#### 4.2 The shell component

```tsx
"use client";
import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { useAchievements, selectXP } from "../store/achievements-store";
import { ACHIEVEMENTS } from "../data/achievements";
import { getLevelInfo } from "../data/levels";

const AchievementsTab = dynamic(() => import("./tabs/AchievementsTab"), { ssr: false });
const ProgressTab     = dynamic(() => import("./tabs/ProgressTab"),     { ssr: false });
const HistoryTab      = dynamic(() => import("./tabs/HistoryTab"),      { ssr: false });
const Celebrate       = dynamic(() => import("./Celebrate"),            { ssr: false });

export default function AchievementSystem() {
  const [tab, setTab] = useState<"achievements" | "progress" | "history">("achievements");
  const xp = useAchievements(selectXP);
  const unlocked = useAchievements((s) => s.unlocked);
  const [celebrate, setCelebrate] = useState(false);
  const lvl = useMemo(() => getLevelInfo(xp), [xp]);

  return (
    <div className="space-y-5">
      {celebrate && <Celebrate onDone={() => setCelebrate(false)} />}
      <Header xp={xp} level={lvl} />
      <Tabs value={tab} onChange={setTab} />
      {tab === "achievements" && <AchievementsTab unlocked={unlocked} onUnlock={() => setCelebrate(true)} />}
      {tab === "progress" && <ProgressTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
```

Note: single source of truth (`useAchievements`), no `unlockedIds` Set, no `UNLOCK_TIMELINE` seed, confetti lazy-loaded only when a real unlock fires.

#### 4.3 Tour via driver.js

```ts
// src/features/ux-innovations/onboarding/useTour.ts
"use client";
import { useCallback } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOUR_STEPS } from "./tour-steps";

const KEY = "tour:completed";
export function useTour() {
  const start = useCallback(() => {
    const steps = TOUR_STEPS.filter(
      (s) => s.element === "body" || document.querySelector(s.element),
    );
    const d = driver({
      showProgress: true,
      steps,
      onDestroyed: () => localStorage.setItem(KEY, "true"),
    });
    d.drive();
  }, []);
  const seen = () => (typeof window !== "undefined" ? !!localStorage.getItem(KEY) : true);
  return { start, seen };
}
```

```ts
// tour-steps.ts — derived from the real nav config, not hardcoded dead routes
import { NAV_ITEMS } from "@/app/dashboard/nav-config";
export const TOUR_STEPS = [
  { element: "body", popover: { title: "Welcome to Data Navigator", description: "2-minute tour.", align: "center" } },
  ...NAV_ITEMS.map((n) => ({
    element: `[href="${n.href}"]`,
    popover: { title: n.title, description: n.tourBlurb ?? n.title, side: "right" },
  })),
];
```

This guarantees the tour can never point at a route that doesn't exist, and shrinks the onboarding dep from react-joyride to driver.js (~5kB).

#### 4.4 Toast with the already-bundled `motion`

```tsx
import { motion, AnimatePresence } from "motion/react";
export function AchievementToast({ def, onDismiss }: ToastProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="fixed bottom-6 right-6 z-[9999] ..."
        onAnimationComplete={() => setTimeout(onDismiss, 5000)}
      >
        {/* ... */}
      </motion.div>
    </AnimatePresence>
  );
}
```

#### 4.5 Progress/History tabs from real data

```tsx
// ProgressTab.tsx — real heatmap from the event log, not HEATMAP_DATA constant
const events = useAchievements((s) => s.events);
const heat = useMemo(() => buildHeatmap(events, 7 * 7), [events]); // group by day
```

`buildHeatmap` buckets the real ISO timestamps into day cells — the same UI, now reflecting actual usage.

---

### 5. Recommended dependencies

| Dep | Action | ~Stars | Maint. | License | Bundle | Offline | Why |
|---|---|---|---|---|---|---|---|
| **driver.js** | ADD (replace react-joyride) | 25.7k | v1.4.0 Nov 2025 | MIT | ~5kB gz | yes | Zero-dep spotlight tour, 5x stars of joyride, far smaller, repositions only on step change. |
| **canvas-confetti** | ADD (replace react-confetti-boom) | 12.6k | v1.9.4 Oct 2025 | ISC | ~6kB gz | yes | Built-in `useWorker` OffscreenCanvas path → confetti off the main thread. |
| **dexie** | ADD (replace localStorage) | 13k | Active | Apache-2.0 | ~25kB gz | yes | Async, durable, worker-accessible store for unlocks + event log + counters. |
| **zustand** | REUSE (already in project) | 49k+ | Very active | MIT | bundled | yes | Single reactive source of truth + selectors; replaces bespoke shim + dual Set. |
| **motion** | REUSE (already `^12.40`) | 28k+ | Very active | MIT | bundled | yes | Tour/card/toast transitions; consolidates ad-hoc CSS animations. |
| **@tanstack/react-virtual** | REUSE (already in stack) | 5.5k | Very active | MIT | bundled | yes | Window long event/leaderboard lists past ~100 rows. |
| **yjs + y-protocols** | OPTIONAL (Team mode only) | 19–22k | v13.6 active | MIT | ~18kB | yes | LAN-only real leaderboard/presence; the *only* offline-legal multi-user board (Tech Radar Domain 8). |

**Remove:** `react-joyride` and `react-confetti-boom` from `package.json` after migration (both replaced; react-confetti-boom is low-adoption vs canvas-confetti).

---

### 6. CLIs & tools (all offline)

- **@next/bundle-analyzer** — confirm the achievements feature lands in an async chunk and that confetti/icons aren't in first-load JS.
- **size-limit (+@size-limit/preset-app)** — add a per-feature byte+eval budget so the gamification chunk can't regress.
- **react-scan** — catch the unmemoized re-renders in the 4-tab tree during dev.
- **knip** — already proves these components are unused and that `WHO_HAS`/`PERSONAL_STATS`/`HEATMAP_DATA` are dead-data exports; run it after the rewrite to confirm no orphans remain.
- **axe-core / vitest-axe / @axe-core/playwright** — validate tour overlay focus management, modal focus traps, and progress-dot a11y, all against bundled Chromium offline.
- **vitest** — unit-test the rules engine (`evaluateRules`) and `getLevelInfo` math; these are pure and deterministic.

---

### 7. Phased task list

**P1 — Correctness & honesty (do first; mostly deletion + wiring)**
1. Delete all fake fixtures: `LEADERBOARD_DATA`, `ACTIVITY_EVENTS`, `WHO_HAS`, `PERSONAL_STATS`, `HEATMAP_DATA`, `UNLOCK_TIMELINE`, `getWhoHas`. Confirm with `knip`.
2. Rewrite `achievements-store.ts` as a zustand `persist` store over a Dexie `StateStorage` adapter; call `navigator.storage.persist()` at startup. Remove the `useAchievementsStore` shim and the in-component `unlockedIds`/`unlockedDates` dual state.
3. Build `events/achievement-bus.ts` + `events/rules.ts`; emit real events from existing features (CSV import in `src/core/queries/files.ts`, forecast run, exports). Replace hardcoded `progress` with live counters.
4. Fix `OnboardingTour` targets: derive `TOUR_STEPS` from the real nav config and filter missing selectors.

**P2 — Performance & deps**
5. Swap `react-confetti-boom` → `canvas-confetti` with `useWorker:true`; lazy-load `Celebrate` only on unlock.
6. Swap `react-joyride` → `driver.js`; implement `useTour` hook. Remove both old deps from `package.json`.
7. Split the 2,320-line file into the §4.1 structure; `dynamic(ssr:false)` for each tab; `useMemo` all sorts/filters/derived values; subscribe to the store via narrow selectors.
8. Add `size-limit` + `@next/bundle-analyzer` budgets for the feature chunk; run `react-scan` to confirm re-render hygiene.

**P3 — Optional richness (flagged)**
9. Reframe "Leaderboard"/"Activity" as **Progress** (personal level/streak/heatmap from real events) and **History** (own unlock log). 
10. (Behind a "Team mode" flag) implement the LAN Yjs leaderboard + Awareness presence per Tech Radar Domain 8, reusing the existing collab/Hocuspocus substrate — the only offline-legal multi-user board.
11. Virtualize Progress/History lists with `@tanstack/react-virtual` once they exceed ~100 rows.
12. Add vitest coverage for the rules engine + level math; add axe checks for tour/modal a11y.

---

### 8. Key file references

- `src/features/ux-innovations/components/AchievementSystem.tsx` — lines 71–95 (store shim to remove), 632–714 (fake leaderboard), 718–855 (fake activity), 858–901 (fake stats/heatmap/timeline/who-has), 1393–1559 (in-render sort), 1939–2018 (dual state + setTimeout confetti), 2040–2054 (main-thread ConfettiBoom).
- `src/features/ux-innovations/components/OnboardingTour.tsx` — lines 12–69 (steps targeting non-existent routes), 191–214 (react-joyride config to replace with driver.js).
- `src/features/ux-innovations/store/achievements-store.ts` — lines 36–62 (localStorage parse-per-call to replace with Dexie+zustand).
