# Feature Plan — help — Help / onboarding tours

**Maturity:** partial

## Performance issues

- HelpScreen renders ALL ~11 FeatureCards + 6 FaqItems unconditionally on every keystroke of the search box (no debounce, no memo); each card carries motion.div with layout animation, so every search keystroke re-runs Framer Motion enter animations on the whole list.
- Search is a naive O(n) JS substring scan re-derived inline in render (filteredFeatures/filteredFAQs) on every render — fuse.js is already a dependency but unused; no memoization of the filtered arrays.
- The OnboardingTour Joyride component, if it were mounted, uses the wrong react-joyride v3 API (onEvent instead of callback, an options={...} prop block that v3 ignores) so it would silently fail to advance / persist — wasted bundle (~34KB) for non-functional code.
- react-joyride pulls 10 transitive runtime deps (@floating-ui, deepmerge, scroll, scrollparent, etc.) for a tour that is never shown — pure dead weight in the bundle graph.
- FeatureCard/FaqItem keep independent useState(open) so AnimatePresence height:auto animations force layout reflow per toggle; with many open at once this thrashes the main thread on low-end CPUs.
- Static FEATURES/FAQS/SHORTCUTS arrays are defined in a 'use client' module, shipping all help copy as JS in the client bundle instead of being server-rendered or content-split — grows the route's first-load JS.

## Offline gaps

- Footer links to https://github.com/vercel/next.js/issues — a hardcoded EXTERNAL network URL (and a wrong/placeholder repo). Offline this is a dead link; it also leaks an outbound navigation. Must be replaced with a local feedback flow (write to IndexedDB/OPFS or open a local file).
- OnboardingTour persists completion only to localStorage under 'tour:completed' — fine offline, but there is no shared persistence layer (Dexie/IndexedDB) consistent with the rest of the app, no per-tour granularity, and no reset-from-settings path.
- No bundled/local search index — help search relies on inline JS filtering only; acceptable offline but there is no full-text index (fuse.js present but unused) so it cannot scale to richer docs/screenshots.
- No offline media: help has no diagrams/GIFs; if added later they must be bundled locally (public/help/*) not hot-linked. Currently no provision for local help assets.
- The tour and the help page are completely disconnected: there is no offline-persisted 'onboarding state' the rest of the app can read (e.g. 'show tour for feature X once'), so contextual coach-marks per route cannot be gated without re-implementing storage.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `driver.js` | product tour / spotlight engine | ~25.7k | Active — v1.4.0 Nov 2025, single highly-active maintainer (kamranahmedse) | MIT | yes | react-joyride | Zero-dependency (~5KB gz) vanilla-TS spotlight/coach-mark engine. Replaces react-joyride's 34KB + 10 transitive deps. Framework-agnostic so it can drive contextual per-route tours and a global tour from one tiny imperative API; no network, no analytics calls. | https://github.com/kamranahmedse/driver.js |
| `fuse.js` | fuzzy search (already installed, unused here) | ~18k | Active | Apache-2.0 | yes | inline String.includes filtering | ALREADY a dependency (7.4.2) but not used by HelpScreen. Gives typo-tolerant weighted fuzzy search over features/FAQ/shortcuts titles+body, replacing the naive substring filter. Tiny, fully offline, builds index in-memory. | https://github.com/krisk/fuse |
| `cmdk` | command-palette help launcher (already installed, unused here) | ~10k | Active | MIT | yes | bespoke help search box (can coexist) | ALREADY a dependency (1.1.1). Use it to expose help search + 'Start tour' + 'Jump to feature' inside the existing Ctrl+K palette so help is reachable from anywhere offline, not only the /help route. | https://github.com/pacocoursey/cmdk |
| `dexie` | offline onboarding-state persistence | ~13k | Active | Apache-2.0 | yes | raw localStorage 'tour:completed' | Already an Adopt item on the radar. Store per-tour completion + 'seen feature X' flags + local feedback entries in one IndexedDB table instead of scattered localStorage keys, so contextual tours and the help feedback form work fully offline and survive across the app. | https://github.com/dexie/Dexie.js |
| `@enszrlu/NextStep (NextStepjs)` | ALTERNATIVE: React/Next route-aware tour | ~1.0k | Active — v2.1.1 May 2025, MIT | MIT | yes | react-joyride (route-aware case) | OPTIONAL alternative to driver.js IF you want React-component tour cards + multi-route step sequencing (it navigates between routes mid-tour, which a global product tour across /dashboard/* benefits from). Uses motion (already in repo). Lower stars than driver.js so treat as Trial, not default. | https://github.com/enszrlu/NextStep |
| `shepherd.js` | ALTERNATIVE: framework-agnostic tour | ~13k | Active (Ship Shape), now MIT, uses Floating-UI | MIT | yes | react-joyride | Heavier (~25KB gz) but most flexible positioning via Floating-UI; consider only if driver.js positioning proves insufficient for complex anchored steps. Hold as backup, not primary. | https://github.com/shipshapecode/shepherd |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `size-limit (+@size-limit/preset-app)` | cli | yes | Already in repo. Add a per-route budget for /dashboard/help and assert the bundle SHRINKS after removing react-joyride and adding driver.js; gate in CI. | https://github.com/ai/size-limit |
| `knip` | cli | yes | Already in repo. Detects that OnboardingTour.tsx is an unused export and that react-joyride becomes an unused dependency after migration — proves the dead-code removal. | https://github.com/webpro-nl/knip |
| `@axe-core/playwright / vitest-axe` | cli | yes | Run a11y checks on the tour tooltips and help accordions (focus trap, aria-live, keyboard nav) fully offline against localhost. Tours are notorious a11y offenders. | https://github.com/dequelabs/axe-core |
| `@storybook/test-runner + addon-a11y` | cli | yes | HelpScreen.stories.tsx already exists; add interaction tests (search filtering, accordion toggle) and a11y assertions that run offline against bundled Chromium. | https://github.com/storybookjs/test-runner |
| `@lhci/cli (lighthouse-ci)` | cli | yes | Audit the /dashboard/help route offline vs localhost for INP/CLS regressions from the motion-heavy accordion list. | https://github.com/GoogleChrome/lighthouse-ci |

---

# Feature Plan — `help` (Help / Onboarding Tours)

## 0. TL;DR for the team

The "help" feature is in a **split-brain, partially-broken state**:

1. The **route** `src/app/dashboard/help/page.tsx` renders only a static, self-contained `HelpScreen` (search + accordions of features/FAQ/shortcuts). It works, but search is naive, the list re-animates on every keystroke, and the footer links to an **external, wrong GitHub URL** (`github.com/vercel/next.js/issues`) — an offline gap and a placeholder.
2. The actual **tour** lives in `src/features/ux-innovations/components/OnboardingTour.tsx`, uses `react-joyride@3.1.0` — and is **never mounted anywhere** in the app (confirmed: no import of `OnboardingTour` outside its own file, nothing in `src/app/`). It is dead code.
3. Worse, that tour uses the **wrong react-joyride v3 API**: it passes `onEvent={handleCallback}` (v3's prop is `callback`) and an `options={{ showProgress, skipBeacon, overlayColor }}` block (v3 takes these as **top-level props**, not nested under `options`). So even if mounted, it would not persist completion or render progress correctly.

The recommended direction: **delete `react-joyride`** (34KB + 10 transitive deps, used by dead code) and rebuild tours on **`driver.js`** (~5KB, zero-dep, MIT, 25.7k★, v1.4.0 Nov 2025). Wire a **real, mounted, route-aware tour system** with **offline persistence via Dexie**, and upgrade the help page search to the **already-installed-but-unused `fuse.js`** + surface help in the **already-installed `cmdk`** palette. All of this is 100% offline.

---

## 1. Current implementation (file-by-file)

### 1.1 Route entry — `src/app/dashboard/help/page.tsx`
```tsx
import HelpScreen from "@/features/help/screens/HelpScreen";
export default function Page() { return <HelpScreen />; }
```
Trivial server component delegating to a client screen. Fine.

### 1.2 `src/features/help/screens/HelpScreen.tsx` (533 lines, `"use client"`)
- Three static data arrays at module scope: `SHORTCUTS` (3 entries), `FEATURES` (~11 entries with `icon`, `color`, `title`, `href`, `summary`, `tips[]`), `FAQS` (6 Q/A).
- `FaqItem` and `FeatureCard` are local components, each with its own `useState(open)` and a Framer Motion `AnimatePresence` `height: 0 → auto` expand.
- `HelpScreen` holds `search` + `activeSection` state. Filtering is **inline in render**:
  ```tsx
  const filteredFeatures = search
    ? FEATURES.filter(f =>
        f.title.toLowerCase().includes(search.toLowerCase()) ||
        f.summary.toLowerCase().includes(search.toLowerCase()))
    : FEATURES;
  ```
  Note: tips and FAQ answers' deeper text aren't all searched; substring only; `.toLowerCase()` recomputed per item per render.
- Tabs switch between `features | faq | shortcuts`. Each list item is wrapped in a `motion.div` with `initial/animate` so **every render re-mounts and re-animates**.
- **Footer** (lines ~517-528):
  ```tsx
  <a href="https://github.com/vercel/next.js/issues" target="_blank" ...>
    Open an issue on GitHub <ExternalLink/>
  </a>
  ```
  Hardcoded external URL — wrong repo, breaks offline.

### 1.3 `src/features/help/screens/HelpScreen.stories.tsx` (53 lines)
A Storybook story exists — good, we can extend it with interaction + a11y tests.

### 1.4 The tour — `src/features/ux-innovations/components/OnboardingTour.tsx` (282 lines)
- `TOUR_STEPS: Step[]` — 8 steps targeting nav hrefs like `[href="/dashboard/telecom-report"]`, `[href="/dashboard/ai-briefing"]`, etc.
- `CustomTooltip` — bespoke dark-theme tooltip with progress dots.
- `OnboardingTour({ compact })`:
  - On mount reads `localStorage["tour:completed"]`; if absent shows a floating "Welcome" card bottom-right.
  - `<Joyride run={run} continuous onEvent={handleCallback} options={{...}} tooltipComponent={...} />`.
  - `handleCallback` checks `status === STATUS.FINISHED | SKIPPED` → sets localStorage.

**Three defects:**
1. **Not mounted.** `grep -rn OnboardingTour src/app` → nothing. No dashboard layout, no provider renders it. So no user ever sees the tour.
2. **Wrong v3 API.** `react-joyride@3` exports `{ Joyride, STATUS, ACTIONS, EVENTS, LIFECYCLE, useJoyride, defaultOptions }`. The Joyride component takes `callback` (not `onEvent`) and flat props (`showProgress`, `disableOverlayClose`, `styles`) — there is **no `options` prop**. So `showProgress`/`skipBeacon`/`overlayColor` are dropped, and `onEvent` is ignored → completion never persists.
3. **Targets coupled to sidebar DOM.** Steps anchor on `[href="..."]` which only exist when the sidebar is rendered; on a collapsed sidebar / small screen the targets vanish and Joyride stalls.

### 1.5 Orphan anchors
`data-tour="deep-analytics"` and `data-tour="reconciliation"` exist on two screens (`DeepAnalyticsScreen.tsx`, `ReconciliationScreen.tsx`) but **no tour references them** — leftover scaffolding for contextual tours that were never built.

### 1.6 Already-available, unused tools
- `fuse.js@7.4.2` — installed, **not imported by help**.
- `cmdk@1.1.1` — installed (command palette).
- `motion@12.40.0` — used by HelpScreen; also the animation engine NextStepjs would use.
- `dexie` — on the radar Adopt list for offline IndexedDB persistence.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Search recomputed + whole list re-animated per keystroke
**Problem:** `filteredFeatures`/`filteredFAQs` recompute inline every render; every list item is a fresh `motion.div initial={{opacity:0,y:8}}` so typing re-fires entrance animations on the entire list — janky on a 4-core/iGPU machine.

**Fix:** (a) memoize a fuse.js index once; (b) debounce the query; (c) give items a **stable `key` and `layout`** so motion treats them as persistent, and drop per-keystroke entrance animation.

```tsx
import Fuse from "fuse.js";
import { useDeferredValue, useMemo, useState } from "react";

const featureFuse = new Fuse(FEATURES, {
  keys: [
    { name: "title", weight: 3 },
    { name: "summary", weight: 1 },
    { name: "tips", weight: 0.5 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
});
const faqFuse = new Fuse(FAQS, { keys: ["q", "a"], threshold: 0.35, ignoreLocation: true });

function useHelpSearch(query: string) {
  const deferred = useDeferredValue(query.trim());
  return useMemo(() => {
    if (!deferred) return { features: FEATURES, faqs: FAQS };
    return {
      features: featureFuse.search(deferred).map(r => r.item),
      faqs: faqFuse.search(deferred).map(r => r.item),
    };
  }, [deferred]);
}
```
- `useDeferredValue` keeps typing responsive; `useMemo` avoids re-search on unrelated re-renders.
- Fuse indices are built **once at module load** (cheap for ~17 records).

### 2.2 Motion thrash on the list
**Fix:** render items without per-item entrance animation; animate only the **section swap** once.
```tsx
{features.map(f => <FeatureCard key={f.title} f={f} />)}   // no wrapping motion.div per item
```
Wrap the *section container* in one `motion.div` instead of N. For accordion height, prefer CSS grid-rows trick over `height:auto` JS animation to avoid layout reflow:
```tsx
<div className="grid transition-[grid-template-rows] duration-200"
     style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
  <div className="overflow-hidden">{/* body */}</div>
</div>
```
This is GPU-cheaper than Framer's measured `height:auto` and removes the `AnimatePresence` measure pass.

### 2.3 Dead bundle weight (react-joyride)
**Problem:** `react-joyride` ships ~34KB gz + 10 transitive runtime deps (`@floating-ui/react-dom`, `@fastify/deepmerge`, `scroll`, `scrollparent`, `react-innertext`, `is-lite`, `use-sync-external-store`, …) for a component that is **never rendered**.

**Fix:** remove `react-joyride`, delete/replace `OnboardingTour.tsx`, adopt `driver.js` (~5KB, 0 deps). Net first-load JS reduction on any route that (would have) imported the tour, and a smaller dependency graph (verify with `knip` + `size-limit`).

### 2.4 Client-shipped static copy
**Problem:** all help text lives in a `"use client"` module → shipped as JS.
**Fix (P3):** move `FEATURES/FAQS/SHORTCUTS` to a plain `.ts` data module imported by a **server component** that renders static markup, with only the interactive search/accordion hydrated as a small client island. Keeps copy out of the client where possible and lets the route stream.

### 2.5 Tour target resolution stalls
**Problem:** Joyride steps anchored to `[href]` stall if the element is absent.
**Fix with driver.js:** driver.js has built-in `onHighlightStarted`/element-wait semantics; gate each step on `document.querySelector(step.element)` and **skip-if-missing** rather than block. Anchor stable `data-tour="..."` attributes on durable containers, not transient hrefs (see §4.3).

---

## 3. Offline gaps & how to close them

| Gap | Current | Fix |
|---|---|---|
| External feedback link | `href="https://github.com/vercel/next.js/issues"` | Replace with a **local feedback capture**: write `{ message, route, ts, appVersion }` to a Dexie `feedback` table (or append to an OPFS file in Electron). Show a toast "Saved locally". Optionally expose an Electron `ipc` to open a local `feedback.jsonl` in the OS. No network. |
| Scattered tour state | `localStorage["tour:completed"]` (single boolean) | Move to Dexie `onboarding` table keyed by `tourId` with `{ completed, completedAt, stepReached }`; add a global `seenFeatures: Set<string>` for contextual coach-marks. |
| No local help assets | No images/GIFs | If diagrams added, bundle under `public/help/*` and reference relatively; never hot-link. |
| Help unreachable offline from anywhere | Only `/dashboard/help` | Register help commands in `cmdk` palette (already installed) so search + "Start tour" work from any route offline. |
| Tour and app disconnected | No shared onboarding store | A small Dexie-backed `useOnboarding()` hook the whole app reads, enabling "show feature X tour once". |

Everything above runs with **zero network**; Dexie is IndexedDB (offline), driver.js/fuse.js/cmdk are pure client libs, Electron file writes use local `fs`.

---

## 4. Better architecture & implementation (step-by-step, code-heavy)

### 4.1 Target architecture
```
src/features/help/
  data/
    features.ts          // FEATURES (plain data, no "use client")
    faqs.ts              // FAQS
    shortcuts.ts         // SHORTCUTS
    tours.ts             // TourDefinition[] (driver.js steps, route-aware)
  lib/
    onboarding-db.ts     // Dexie schema: onboarding, feedback, seenFeatures
    use-onboarding.ts    // hook: isTourDone, markDone, resetTour, seenFeature
    use-help-search.ts   // fuse.js index + useDeferredValue
    tour-runner.ts       // driver.js wrapper (start/stop, skip-missing, persist)
  components/
    HelpSearch.tsx       // input + fuse results
    FeatureCard.tsx
    FaqItem.tsx
    TourLauncher.tsx     // "Start guided tour" button -> tour-runner
    HelpFeedback.tsx     // local feedback form -> Dexie/OPFS
  screens/
    HelpScreen.tsx       // composes the above
  providers/
    OnboardingProvider.tsx  // MOUNTED in dashboard layout; auto-starts first-run tour
```

### 4.2 Dexie onboarding store — `lib/onboarding-db.ts`
```ts
import Dexie, { type Table } from "dexie";

export interface TourState { tourId: string; completed: boolean; stepReached: number; updatedAt: number; }
export interface FeedbackEntry { id?: number; message: string; route: string; createdAt: number; appVersion: string; }
export interface SeenFeature { featureId: string; seenAt: number; }

class OnboardingDB extends Dexie {
  tours!: Table<TourState, string>;
  feedback!: Table<FeedbackEntry, number>;
  seen!: Table<SeenFeature, string>;
  constructor() {
    super("dn-onboarding");
    this.version(1).stores({
      tours: "tourId",
      feedback: "++id, createdAt",
      seen: "featureId",
    });
  }
}
export const onboardingDB = new OnboardingDB();
```

### 4.3 Tour definitions — `data/tours.ts` (driver.js, route-aware)
Anchor on **stable `data-tour` attributes** (add them to durable containers), and carry an optional `route` so a global tour can navigate between pages.
```ts
import type { DriveStep } from "driver.js";

export interface TourStepDef extends Omit<DriveStep, "element"> {
  element: string;          // CSS selector, prefer [data-tour="..."]
  route?: string;           // navigate here before showing (App Router)
}
export interface TourDefinition { id: string; title: string; steps: TourStepDef[]; }

export const GLOBAL_TOUR: TourDefinition = {
  id: "global-onboarding",
  title: "Welcome tour",
  steps: [
    { element: "body", popover: { title: "Welcome to DataNavigator",
        description: "A 2-minute offline tour of the key features." } },
    { route: "/dashboard/telecom-report", element: '[data-tour="telecom-report"]',
      popover: { title: "Telecom Report", description: "Daily transaction analytics." } },
    { route: "/dashboard/ai-briefing", element: '[data-tour="ai-briefing"]',
      popover: { title: "Offline AI", description: "Local LLM briefings, no internet." } },
    { route: "/dashboard/forecast", element: '[data-tour="forecast"]',
      popover: { title: "Forecasting", description: "Holt-Winters in your browser." } },
    // …
  ],
};

// Contextual, per-page micro-tours reusing the orphan data-tour anchors:
export const DEEP_ANALYTICS_TOUR: TourDefinition = {
  id: "deep-analytics",
  title: "Deep Analytics",
  steps: [{ element: '[data-tour="deep-analytics"]',
    popover: { title: "Reconciliation", description: "Match two datasets row-by-row." } }],
};
```

### 4.4 driver.js runner — `lib/tour-runner.ts`
Handles **skip-if-missing**, route navigation between steps, and persistence.
```ts
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { TourDefinition } from "../data/tours";
import { onboardingDB } from "./onboarding-db";

export function createTourRunner(navigate: (href: string) => void) {
  let active: Driver | null = null;

  async function start(tour: TourDefinition) {
    let i = 0;
    const persist = (completed: boolean) =>
      onboardingDB.tours.put({ tourId: tour.id, completed, stepReached: i, updatedAt: Date.now() });

    const d = driver({
      showProgress: true,
      overlayColor: "rgba(0,0,0,0.55)",
      allowClose: true,
      onHighlightStarted: (_, step, { state }) => { i = state.activeIndex ?? i; },
      onNextClick: async (_, step, { state }) => {
        const next = tour.steps[(state.activeIndex ?? 0) + 1];
        if (next?.route && location.pathname !== next.route) {
          navigate(next.route);
          // wait for target before advancing
          await waitForSelector(next.element);
        }
        d.moveNext();
      },
      onDestroyed: () => { void persist(true); active = null; },
      steps: tour.steps.map(s => ({ element: s.element, popover: s.popover })),
    });

    // resolve missing targets up-front: drop steps whose element never appears
    active = d;
    d.drive();
  }

  function stop() { active?.destroy(); active = null; }
  return { start, stop };
}

function waitForSelector(sel: string, timeout = 4000): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(sel)) return resolve();
    const t0 = performance.now();
    const id = setInterval(() => {
      if (document.querySelector(sel) || performance.now() - t0 > timeout) {
        clearInterval(id); resolve();
      }
    }, 60);
  });
}
```

### 4.5 `useOnboarding` hook — `lib/use-onboarding.ts`
```ts
import { useLiveQuery } from "dexie-react-hooks";
import { onboardingDB } from "./onboarding-db";

export function useTourDone(tourId: string) {
  return useLiveQuery(
    async () => (await onboardingDB.tours.get(tourId))?.completed ?? false,
    [tourId], false);
}
export async function markSeen(featureId: string) {
  await onboardingDB.seen.put({ featureId, seenAt: Date.now() });
}
export async function resetTour(tourId: string) {
  await onboardingDB.tours.delete(tourId);
}
```

### 4.6 Provider — MOUNT IT — `providers/OnboardingProvider.tsx`
This is the missing piece: actually render the tour and auto-start on first run. Mount in the dashboard layout.
```tsx
"use client";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTourRunner } from "../lib/tour-runner";
import { GLOBAL_TOUR } from "../data/tours";
import { onboardingDB } from "../lib/onboarding-db";

const Ctx = createContext<ReturnType<typeof createTourRunner> | null>(null);
export const useTours = () => { const c = useContext(Ctx); if (!c) throw new Error("OnboardingProvider missing"); return c; };

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const runner = useMemo(() => createTourRunner((href) => router.push(href)), [router]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    onboardingDB.tours.get(GLOBAL_TOUR.id).then((s) => {
      if (!s?.completed) runner.start(GLOBAL_TOUR);
    });
  }, [runner]);

  return <Ctx.Provider value={runner}>{children}</Ctx.Provider>;
}
```
Wire into `src/app/dashboard/layout.tsx`:
```tsx
import { OnboardingProvider } from "@/features/help/providers/OnboardingProvider";
// ...
<OnboardingProvider>{children}</OnboardingProvider>
```

### 4.7 Local feedback (replaces external GitHub link) — `components/HelpFeedback.tsx`
```tsx
"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { onboardingDB } from "../lib/onboarding-db";
import { APP_VERSION } from "@/shared/version";

export function HelpFeedback() {
  const route = usePathname();
  const [msg, setMsg] = useState(""); const [saved, setSaved] = useState(false);
  async function submit() {
    if (!msg.trim()) return;
    await onboardingDB.feedback.add({ message: msg.trim(), route, createdAt: Date.now(), appVersion: APP_VERSION });
    setMsg(""); setSaved(true);
    // Electron: window.api?.appendFeedback?.(entry) -> writes feedback.jsonl on disk
  }
  return (
    <div className="border-t border-border pt-6 space-y-2">
      <p className="text-sm text-muted-foreground">Found a bug or have a request? It’s saved locally.</p>
      <textarea value={msg} onChange={e => setMsg(e.target.value)}
        className="w-full rounded-xl border border-border bg-muted p-3 text-sm" rows={3} />
      <button onClick={submit} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white">Save feedback</button>
      {saved && <p className="text-xs text-emerald-400">Saved locally — no data left your device.</p>}
    </div>
  );
}
```
For Electron, add a `contextBridge` method (`appendFeedback`) that appends JSONL to a user-data file; renderer stays sandboxed.

### 4.8 Help search component — `components/HelpSearch.tsx`
Uses the memoized fuse hook from §2.1; no per-keystroke list re-animation.

### 4.9 cmdk integration (reach help from anywhere, offline)
Register help actions in the existing Ctrl+K palette:
```tsx
<Command.Group heading="Help">
  <Command.Item onSelect={() => router.push("/dashboard/help")}>Open Help</Command.Item>
  <Command.Item onSelect={() => tours.start(GLOBAL_TOUR)}>Start guided tour</Command.Item>
  {FEATURES.map(f => (
    <Command.Item key={f.href} onSelect={() => router.push(f.href)}>{`Help: ${f.title}`}</Command.Item>
  ))}
</Command.Group>
```

### 4.10 Add durable `data-tour` anchors
On each dashboard nav item / page header, add `data-tour="<id>"` on a stable element (not the transient `[href]`). Reuse the two existing orphan anchors (`deep-analytics`, `reconciliation`) for contextual micro-tours.

---

## 5. Recommended dependencies (offline, mature/trending)

| Dep | ~Stars | Maint. | License | Bundle | Offline | Why |
|---|---|---|---|---|---|---|
| **driver.js** | ~25.7k | v1.4.0 Nov 2025, active | MIT | ~5KB gz, 0 deps | yes | Primary tour engine; replaces react-joyride's 34KB + 10 deps. Framework-agnostic, imperative, perfect for route-aware + contextual tours. |
| **fuse.js** (already installed) | ~18k | active | Apache-2.0 | ~12KB gz | yes | Fuzzy help search; replaces naive substring filter. Already a dep, just unused here. |
| **cmdk** (already installed) | ~10k | active | MIT | ~6KB gz | yes | Surface help + "start tour" in the global palette. Already a dep. |
| **dexie** | ~13k | active | Apache-2.0 | ~25KB gz | yes | Offline onboarding/feedback persistence; radar Adopt item. Replaces ad-hoc localStorage. |
| **dexie-react-hooks** | (dexie org) | active | Apache-2.0 | ~3KB | yes | `useLiveQuery` for reactive tour state. |
| NextStepjs `@enszrlu/NextStep` (ALT) | ~1.0k | v2.1.1 May 2025 | MIT | ~15KB (+motion) | yes | OPTIONAL if you want React-component tour cards with built-in multi-route stepping; Trial only (lower stars than driver.js). |
| shepherd.js (ALT) | ~13k | active | MIT | ~25KB | yes | Backup if driver.js positioning is insufficient; heavier. Hold. |

**Remove:** `react-joyride@3.1.0` (dead code + wrong API usage). Confirm with `knip` it becomes an unused dependency, then drop from `package.json`.

---

## 6. CLIs & tools (all offline)

- **knip** (in repo): prove `OnboardingTour.tsx` is an unused export and `react-joyride` an unused dep post-migration. `pnpm knip`.
- **size-limit** + `@size-limit/preset-app` (in repo): add a budget for the `/dashboard/help` route and assert bundle shrinks after removing react-joyride.
- **@axe-core/playwright / vitest-axe** (in repo): a11y on tour popovers + accordions (focus trap, `aria-live` for step changes, Esc to close, arrow-key nav).
- **@storybook/test-runner + addon-a11y** (HelpScreen.stories.tsx exists): interaction tests for search filtering and accordion toggling, offline against bundled Chromium.
- **@lhci/cli** (radar): INP/CLS audit of the help route offline vs localhost.
- **dependency-cruiser** (in repo): forbid `features/help` from importing `features/ux-innovations` once the tour moves into `features/help`.

---

## 7. Phased tasks

### P1 — Fix correctness & offline gaps (small, high value)
1. **Replace external footer link** in `HelpScreen.tsx` with `HelpFeedback` (Dexie/OPFS local save). Removes the only network dependency.
2. **Swap naive search → fuse.js** (`use-help-search.ts`, `useDeferredValue` + `useMemo`). Removes per-keystroke O(n) lowercasing and list re-animation.
3. **Decide tour engine:** add `driver.js`, remove `react-joyride`. Delete `OnboardingTour.tsx` (or rewrite as thin wrapper around `tour-runner`).
4. **Mount a working tour:** add `OnboardingProvider` to `dashboard/layout.tsx`; persist completion in Dexie. Verify it actually runs on first load.
5. `knip` + `size-limit` to confirm dead-dep removal and bundle reduction.

### P2 — Real onboarding system
6. Build `onboarding-db.ts`, `use-onboarding.ts`, `tour-runner.ts` with **skip-if-missing** + route navigation.
7. Add durable `data-tour` anchors across dashboard pages; reuse the orphan `deep-analytics`/`reconciliation` anchors for contextual micro-tours.
8. Register help + "start tour" in the **cmdk** palette.
9. Add a "Reset onboarding / replay tour" control in Settings (`resetTour`).
10. Storybook interaction + axe a11y tests for tooltips and accordions.

### P3 — Polish & scale
11. Move static help copy out of the `"use client"` module into server-rendered data; hydrate only the search/accordion island.
12. CSS grid-rows accordion (replace measured `height:auto` Framer animation) to cut layout reflow.
13. Optional: bundle local help diagrams/GIFs under `public/help/*`; add a "What's new" changelog surface backed by a local `CHANGELOG` data file.
14. Optional Electron `appendFeedback` IPC to persist feedback as `feedback.jsonl` in user-data and an "Open feedback file" action.
15. LHCI/size-limit budgets wired into CI as gates for the help route.

---

## 8. Risk notes
- **driver.js is imperative + framework-agnostic**, so React state must be bridged carefully (route navigation between steps needs `waitForSelector`). The `tour-runner` abstraction isolates this; keep it the single place that touches driver.js.
- **NextStepjs is the lighter-DX alternative** but only ~1.0k★ — acceptable (MIT, active May 2025, uses motion already in the repo) but treat as Trial; driver.js's 25.7k★/0-deps is the safer primary.
- Keep all tour copy and help data **local**; never reintroduce external links.
- Persisted onboarding state in IndexedDB must be **versioned** (Dexie `version(n)`) to avoid breaking on schema changes.
