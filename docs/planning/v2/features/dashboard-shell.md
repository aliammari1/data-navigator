# Feature Plan — dashboard-shell

**Maturity:** functional

## Performance issues

- sidebar-nav.tsx is a single 1566-line 'use client' module that ships ECharts-adjacent imports, motion/react, ~45 lucide icons, and 5 separate dropdown popovers into the always-mounted shell; it re-renders on every route change because NavButton calls usePathname() per-item (every nav item re-renders on navigation).
- Command palette is hand-rolled (cmdk is a dependency but unused here): filtering runs a fresh .filter() over ALL_ITEMS on every keystroke without useMemo, recomputed inside render, and there is no fuzzy ranking — despite fuse.js already being bundled.
- AIPanel (ai-panel.tsx, 1289 lines) is mounted in the shell at all times via DashboardClientShell; even when closed it imports echarts-for-react (dynamic but the module graph for buildChartFromResult, insights, nlq is eagerly imported) and runs effects. The AnimatePresence guard only stops rendering, not the import cost or the catalog effect wiring.
- ResultTable renders up to 50 rows as a plain HTML <table> with no virtualization and key={JSON.stringify(row).slice(0,64)} — serializing every row to JSON on each render purely to build a key.
- Topbar rebuilds breadcrumbs (pathname.split + map + regex replace) and a static NOTIFS array literal on every render; the notification list is hardcoded mock data, not memoized.
- Every dropdown (DatasetPicker, AccessControlPill, GlobalDataSearch, notifications) installs its own document mousedown listener and its own useEffect; 4-5 global listeners attached on the always-mounted topbar.
- DatasetPicker / GlobalDataSearch call useDataStore() with no selector — subscribing the whole store, so any dataset/loadedTableNames mutation re-renders the entire topbar.
- motion/react (Framer Motion successor) animates sidebar width on every collapse and wraps every popover in AnimatePresence; on a medium iGPU these layout-animating width transitions cause main-thread layout thrash. The sidebar width animation animates layout (width) not transform.
- No route-level code splitting discipline: the shell + AI panel + LAN dock + all nav metadata load on first dashboard paint, inflating the initial dashboard bundle even though most users never open the AI panel or LAN center.

## Offline gaps

- Sidebar logo hardcodes the subtitle 'DuckDB WASM' even though the Tech Radar mandates the native @duckdb/node-api main-process engine as primary in Electron — misleading and implies a browser-only path.
- Topbar NOTIFS are fabricated static strings ('DuckDB WASM loaded — 10,000 rows ready', 'Alice commented…') — there is no offline notification/event source wired to the activity-store, so the bell is pure mock UI with no local persistence.
- Avatar uses <AvatarImage src={user.image}> which will attempt a network fetch of a remote avatar URL; in a no-internet Electron build this silently fails. No local/initials-only enforcement or asset caching.
- LanStatusDock + lan-collab use fetch() against ws/http LAN URLs and never consult navigator.onLine; there is no graceful 'offline / no hub configured' resting state distinct from 'hub unreachable', so the dock can spin against a dead endpoint.
- Command palette and nav have no awareness of which routes are actually available offline vs. require a model download (forecast/ai pages depend on cached models) — no 'model not yet downloaded' affordance in navigation.
- AI panel welcome copy promises NL→SQL but the LLM fallback path (generateText/isLLMReady in nlq.ts) gives no shell-level indication of whether the local model is downloaded/cached; first-run users get silent rule-based-only behavior with no model-status surface in the shell.
- Shell layout state (sidebar collapsed, AI panel open, active tab) is component-local useState, not persisted to OPFS/IndexedDB via the existing drizzle-storage; every reload resets shell layout even though settings-store already has durable storage.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `cmdk` | command-palette | 12.7k | Active (v1.1.1, Mar 2025); already a project dependency, used by src/components/ui/command.tsx but NOT by the dashboard palette | MIT | yes | hand-rolled CommandPalette in sidebar-nav.tsx | Accessible (ARIA combobox/listbox), composable, unstyled command menu. Already bundled — adopting it removes the bespoke keyboard/focus/aria logic and gives proper a11y for free. | https://github.com/pacocoursey/cmdk |
| `fuse.js` | search/fuzzy-match | 18k | Active; already used in platform/ai/nlq.ts | Apache-2.0 | yes | naive includes() filtering in CommandPalette + GlobalDataSearch | Already in the bundle. Reuse it for ranked fuzzy command/dataset search instead of substring includes(), giving better match ordering with zero new dependency cost. | https://github.com/krisk/fuse |
| `react-resizable-panels` | layout/panels | 5.2k | Very active (v4.11.2, ~3 weeks ago); 16 contributors last quarter; by React DevTools author bvaughn | MIT | yes | fixed-width AI panel + no resizable docking | The 2026 standard for resizable split layouts. Lets the AI/insights panel become a dockable, resizable, persistable region instead of a fixed 440px overlay; persists sizes via its onLayout cookie/storage hook (offline-safe). | https://github.com/bvaughn/react-resizable-panels |
| `dockview` | layout/docking (optional, TRIAL) | 3.3k | Very active (v6.6.1, May 2026); dockview-core is zero-dependency vanilla TS | MIT | yes | bespoke panel/overlay management if the shell grows into an IDE-like multi-panel workspace | Zero-dependency docking layout manager (tabs, groups, splitviews, floating/popout panels). Only adopt if the shell needs true IDE-style multi-panel docking; otherwise react-resizable-panels is lighter. | https://github.com/mathuo/dockview |
| `tinykeys` | keyboard shortcuts | ~3.4k | Very active (v4.0.0, Jun 2026) | MIT | yes | scattered window.addEventListener('keydown') blocks in Topbar + DashboardLayout | ~650B keybinding library; centralizes Cmd+K / Cmd+\ / Cmd+B (and future shortcuts) into one declarative map instead of three separate ad-hoc keydown effects with manual metaKey/ctrlKey checks. | https://github.com/jamiebuilds/tinykeys |
| `@tanstack/react-virtual` | virtualization | 5.5k | Very active; already a project dependency | MIT | yes | non-virtualized 50-row ResultTable and command-palette result list | Already bundled (Tech Radar ADOPT). Use it to virtualize the AI-panel result table and any long command/dataset list so large result sets and big nav/dataset menus stay at 60fps on medium hardware. | https://github.com/TanStack/virtual |
| `react-hotkeys-hook` | keyboard shortcuts (alternative) | ~6k | Very active (v5.3.2, ~1 mo ago); 748 dependents | MIT | yes | manual keydown effects (alternative to tinykeys with React-scoped enable/disable) | Heavier than tinykeys but offers React-component-scoped shortcut enabling, form-field filtering, and scopes — useful if shortcut context (palette open vs closed) needs per-component gating. Pick ONE of tinykeys/this. | https://github.com/JohannesKlauss/react-hotkeys-hook |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@next/bundle-analyzer` | cli | yes | Already in repo. Run against the dashboard route to prove the shell + AI panel + sidebar are over-bundling; verify the AI-panel lazy-split lands. | https://www.npmjs.com/package/@next/bundle-analyzer |
| `size-limit (+@size-limit/preset-app, time plugin)` | cli | yes | Add a per-route budget for /dashboard and a per-component budget for the always-mounted shell so regressions (re-bundling the AI panel into the shell) fail CI. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Install as a dev dep to visually catch the per-NavButton usePathname re-render storm and topbar full-store-subscription re-renders during navigation. | https://github.com/aidenybai/react-scan |
| `axe-core / @storybook/addon-a11y` | library | yes | Run against the new cmdk palette and sidebar stories; the hand-rolled palette has no ARIA roles today — gate a11y in the existing Storybook test-runner. | https://github.com/dequelabs/axe-core |
| `knip` | cli | yes | Already in repo. After replacing the hand-rolled palette with cmdk, knip will flag dead helpers; also confirms cmdk/command.tsx is now actually referenced. | https://github.com/webpro-nl/knip |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Audit the dashboard shell offline against localhost for INP/CLS — the sidebar width animation and palette open are the main interaction-latency suspects. | https://github.com/GoogleChrome/lighthouse-ci |

---

# Dashboard-Shell — Deep Improvement Plan

Feature root: `src/features/dashboard-shell/`
Route root: `src/app/dashboard/`
Target: offline-only Electron + Next.js 16 desktop app, medium-end PC (4-8 cores, 8-16GB RAM, no guaranteed WebGPU).

---

## 1. Current implementation

### 1.1 Composition / wiring

- **`src/app/dashboard/layout.tsx`** (22 lines) — server component (`runtime = "nodejs"`, `dynamic = "force-dynamic"`). Reads the Better-Auth session and renders `<DashboardClientShell user={session?.user}>`.
- **`src/features/dashboard-shell/components/dashboard-client-shell.tsx`** (66 lines) — `"use client"`. Owns `aiOpen` state, syncs the active dataset into `app-context-store` via an effect, and renders:
  - `<DashboardLayout>` (the sidebar + topbar + `<main>`),
  - `<LanAccessGate>` wrapping `children`,
  - `<AIPanel>` + `<AIToggle>` (always mounted),
  - `<LanStatusDock>` (always mounted).
- **`src/features/dashboard-shell/components/sidebar-nav.tsx`** (1566 lines) — the monolith. Exports `DashboardLayout`, plus internally defines `CommandPalette`, `NavButton`, `AppSidebar`, `DatasetPicker`, `AccessControlPill`, `GlobalDataSearch`, `Topbar`, the `NAV_SECTIONS`/`TELECOM_NAV_ITEMS`/`FOOTER_ITEMS` metadata, and helpers (`fmtCompact`, `FORMAT_COLORS`).
- **`ai-panel.tsx`** (1289 lines) — the slide-over AI copilot: NL→SQL via `translateNLQ`, `runReadOnlyQuery`, ECharts rendering (`echarts-for-react` via `next/dynamic`), insights tab, dataset picker.
- **LAN family**: `lan-status-dock.tsx` (70), `lan-control-center.tsx` (535), `lan-access-gate.tsx` (341) — LAN collaboration status surfaced from `platform/lan/lan-collab.ts` (uses `fetch()` against ws/http URLs).
- Smaller blocks: `page-header.tsx`, `stats-card.tsx` and their stories.

### 1.2 Navigation model

`NAV_SECTIONS` (Core / Data / Intelligence) + `TELECOM_NAV_ITEMS` + `FOOTER_ITEMS` are static arrays in `sidebar-nav.tsx`. `ALL_ITEMS` flattens them for the command palette. Routing is plain `next/link` (`NavButton`) plus imperative `router.push` for telecom tabs. Active state is computed per-item via `usePathname()` inside `NavButton` (lines 511-514).

### 1.3 Command palette

Hand-rolled `CommandPalette` (lines 362-507): a `motion.div` overlay with an `<input>`, arrow-key navigation, and `ALL_ITEMS.filter(...)` substring matching. Notably:
- **`cmdk` is already a dependency** (`package.json` line 112) and a wrapper exists at `src/components/ui/command.tsx`, but the dashboard palette does **not** use it.
- **`fuse.js` is already bundled** (used in `nlq.ts`) but the palette uses naive `includes()` with no ranking.

### 1.4 Persistence

`settings-store.ts` persists via `createDrizzleStorage({ namespace: "settings" })` (durable, offline). It already holds `sidebarPinned`, `showBreadcrumbs`, `pinnedItems`, `performance.virtualizeThreshold` (500), `data.defaultRowLimit` (10000). **But shell runtime state** (sidebar `collapsed`, `aiOpen`, AI panel `tab`, command-palette recents) lives in ephemeral `useState` and is lost on reload.

---

## 2. Performance bottlenecks + exact fixes

### 2.1 The 1566-line always-client shell module

`sidebar-nav.tsx` is one `"use client"` file importing ~45 lucide icons, `motion/react`, the dropdown-menu primitives, six stores, and defining seven components. It is in the **critical path of first dashboard paint**, and any change to any piece invalidates the whole module's HMR/bundle chunk.

**Fix — split by responsibility and lazy-load the heavy/rare parts:**

```
src/features/dashboard-shell/
  nav/
    nav-config.ts          // NAV_SECTIONS, TELECOM_NAV_ITEMS, FOOTER_ITEMS, types (no "use client")
    nav-button.tsx         // memoized NavButton
    app-sidebar.tsx
  topbar/
    topbar.tsx
    dataset-picker.tsx
    access-control-pill.tsx
    global-data-search.tsx
    notifications-bell.tsx
  command/
    command-palette.tsx    // cmdk-based
  shell/
    dashboard-layout.tsx
    use-shell-shortcuts.ts // tinykeys
    use-shell-state.ts     // persisted collapsed/aiOpen/tab
```

`nav-config.ts` has no `"use client"` directive, so the metadata can be imported by server components and tree-shaken cleanly.

### 2.2 Per-item `usePathname()` re-render storm

`NavButton` calls `usePathname()` (line 512), so **every** nav item subscribes to the router and re-renders on every navigation — with ~17 main items + 8 telecom + footer that is ~27 components re-rendering on each route change.

**Fix — compute active state once in the parent, pass a boolean, and memoize the button:**

```tsx
// app-sidebar.tsx
const pathname = usePathname();
// ...
{section.items.map((item) => (
  <NavButton
    key={item.href}
    item={item}
    collapsed={collapsed}
    active={isActive(pathname, item.href)}
  />
))}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

// nav-button.tsx
export const NavButton = memo(function NavButton({
  item, collapsed, active,
}: { item: NavItem; collapsed: boolean; active: boolean }) {
  const Icon = item.icon;
  return (/* ...same markup, no usePathname() ... */);
});
```

Now only the previously-active and newly-active buttons re-render; the rest are bailed out by `memo` because their props are referentially stable.

### 2.3 Topbar subscribes to entire stores

`DatasetPicker` / `GlobalDataSearch` call `useDataStore()` with no selector, so any store mutation re-renders the topbar. The `NOTIFS` array literal and breadcrumb computation also rebuild on every render.

**Fix — narrow selectors + memoize derived data:**

```tsx
// dataset-picker.tsx
const datasets = useDataStore((s) => s.datasets);
const activeDatasetId = useDataStore((s) => s.activeDatasetId);
const setActiveDataset = useDataStore((s) => s.setActiveDataset);
const loadedTableNames = useDataStore((s) => s.loadedTableNames);

// topbar.tsx breadcrumbs
const crumbs = useMemo(() => {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, i) => ({
    label: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    href: `/${segments.slice(0, i + 1).join("/")}`,
  }));
}, [pathname]);
```

Move the static `NOTIFS` mock out of the component body to module scope (or, better, source it from `activity-store` — see §4.4).

### 2.4 Always-mounted AI panel pulls its module graph eagerly

`DashboardClientShell` renders `<AIPanel>` unconditionally. Even though `echarts-for-react` is `next/dynamic`, the AI panel **module** (1289 lines + `nlq`, `insights`, `duckdb` imports) is part of the shell chunk and its effects (`useEffect` for focus, scroll, catalog refresh) are wired the moment the shell mounts.

**Fix — lazy-load the whole panel and only mount when first opened:**

```tsx
// dashboard-client-shell.tsx
import dynamic from "next/dynamic";
const AIPanel = dynamic(
  () => import("@/features/dashboard-shell/components/ai-panel").then((m) => m.AIPanel),
  { ssr: false },
);

const [aiEverOpened, setAiEverOpened] = useState(false);
const toggleAiPanel = useCallback(() => {
  setAiEverOpened(true);
  setAiOpen((v) => !v);
}, []);

// ...
{aiEverOpened && <AIPanel open={aiOpen} onClose={closeAiPanel} />}
<AIToggle onClick={toggleAiPanel} active={aiOpen} />
```

`AIToggle` is tiny and stays eager; the heavy panel (ECharts, NLQ, insights) loads on first toggle. This is the single biggest first-paint bundle win for the dashboard route.

### 2.5 Command palette: unmemoized filter, no ranking, no virtualization

`filtered` (lines 368-377) recomputes on every render; results are unranked substring matches.

**Fix — replace with `cmdk` + `fuse.js` ranking (both already bundled):**

```tsx
// command/command-palette.tsx
import { Command } from "cmdk";
import Fuse from "fuse.js";
import { ALL_ITEMS } from "../nav/nav-config";

const fuse = new Fuse(ALL_ITEMS, {
  keys: ["title", "description", "keywords"],
  threshold: 0.35,
  ignoreLocation: true,
});

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => (query.trim() ? fuse.search(query).map((r) => r.item) : ALL_ITEMS.slice(0, 8)),
    [query],
  );

  return (
    <Command.Dialog open={open} onOpenChange={(o) => !o && onClose()} label="Command palette" shouldFilter={false}>
      <Command.Input value={query} onValueChange={setQuery} placeholder="Search pages, features…" />
      <Command.List>
        <Command.Empty>No results for "{query}"</Command.Empty>
        {results.map((item) => (
          <Command.Item
            key={item.href}
            value={item.href}
            onSelect={() => { router.push(item.href); onClose(); }}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
            <span className="text-xs text-muted-foreground">{item.description}</span>
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
```

`cmdk` gives ARIA combobox/listbox semantics, focus trapping, and keyboard nav for free — deleting ~145 lines of hand-rolled logic and fixing accessibility. `shouldFilter={false}` lets fuse own ranking. For very large item sets, wrap `Command.List` rows in `@tanstack/react-virtual` (already bundled).

### 2.6 ResultTable: JSON.stringify keys + no virtualization

`ai-panel.tsx` line 376 builds row keys with `JSON.stringify(row).slice(0, 64)` — serializing every row each render. It renders up to 50 rows as a static table.

**Fix — stable index/id keys + virtualize past the settings threshold:**

```tsx
const virtualize = result.rows.length > useSettingsStore.getState().performance.virtualizeThreshold;
// key={`row-${index}`} is sufficient for an immutable result set
```

Pull the threshold from `performance.virtualizeThreshold` (already 500 in settings) and use `useVirtualizer` for the table body when exceeded. Keep the existing 50-row cap as the chat-bubble preview, but make the full result openable in a virtualized view.

### 2.7 Layout-animating sidebar width

`AppSidebar` animates `width` (52↔220) via `motion.aside` (line 585). Animating `width` triggers layout on every frame; on a medium iGPU this thrashes.

**Fix — animate a CSS variable / transform, or drop the JS animation:**

```tsx
<aside
  data-collapsed={collapsed}
  className="… transition-[width] duration-200 ease-out"
  style={{ width: collapsed ? 52 : 220 }}
>
```

CSS `transition-[width]` is still a layout transition, but removing `motion` from the sidebar shell removes a Framer subscription from the always-mounted tree. If smoothness matters, animate `transform: translateX` of an inner fixed-width container instead of the box `width`. Reserve `motion` for the rare popovers (palette, AI panel) that are lazy-mounted.

### 2.8 Duplicate global mousedown listeners

`DatasetPicker`, `AccessControlPill`, `GlobalDataSearch`, and notifications each attach a `document.addEventListener("mousedown", …)` (4-5 listeners on the always-mounted topbar).

**Fix — a single shared `useClickOutside(ref, onClose, enabled)` hook**, only active while a popover is `open`:

```tsx
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>, onOutside: () => void, enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, enabled]);
}
```

Gating on `enabled` means **zero** listeners when all popovers are closed (the common case).

### 2.9 Scattered keyboard handlers → tinykeys

Cmd+K (Topbar line 1224), Cmd+\\ and Cmd+B (`DashboardLayout` line 1537) are three separate `window.addEventListener("keydown")` effects with manual `metaKey || ctrlKey` checks.

**Fix — one `tinykeys` map (~650B) in `use-shell-shortcuts.ts`:**

```ts
import { tinykeys } from "tinykeys";
export function useShellShortcuts(actions: {
  togglePalette: () => void; toggleAi: () => void; toggleSidebar: () => void;
}) {
  useEffect(() => tinykeys(window, {
    "$mod+k": (e) => { e.preventDefault(); actions.togglePalette(); },
    "$mod+Backslash": (e) => { e.preventDefault(); actions.toggleAi(); },
    "$mod+b": (e) => { e.preventDefault(); actions.toggleSidebar(); },
  }), [actions]);
}
```

`$mod` maps to Cmd on macOS / Ctrl elsewhere automatically.

---

## 3. Offline gaps + how to close them

### 3.1 Remote avatar fetch

`Topbar` renders `<AvatarImage src={user.image}>` (lines 1472, 1482). In a no-internet build this attempts a network fetch.

**Fix:** for the Electron/offline build, never pass a remote URL straight through. Either (a) omit `AvatarImage` and always render initials (`AvatarFallback`), or (b) cache the avatar once to OPFS on first sign-in and serve via a custom `app://` protocol. Initials-only is the simplest offline-correct default.

### 3.2 Misleading "DuckDB WASM" branding

Sidebar logo subtitle hardcodes `"DuckDB WASM"` (line 609); the notifications mock says "DuckDB WASM loaded". Per the Tech Radar, the **primary Electron engine is native `@duckdb/node-api`**, not WASM.

**Fix:** make the subtitle reflect the actual engine resolved at runtime (e.g., a `useEngineInfo()` hook returning `"DuckDB native"` in Electron, `"DuckDB WASM"` only in a browser build). Surfaces honesty and helps debugging.

### 3.3 Fabricated notifications, no local event source

`NOTIFS` (lines 1251-1284) is hardcoded mock data. There is an `activity-store` (used by `DatasetPicker.addActivity`) but the bell is not wired to it.

**Fix:** source the notification list from `useActivityStore` (recent events: uploads, query completions, errors), persisted offline via the existing drizzle-storage. Honor `settings.notifications.{uploads,queries,errors}` filters. Drop the fake "Alice commented" string unless real LAN-collab presence supplies it.

### 3.4 LAN dock has no `navigator.onLine` / "not configured" state

`LanStatusDock` + `lan-collab` `fetch()` against ws/http URLs with no `navigator.onLine` gate and no distinction between "no hub configured", "offline", and "hub unreachable".

**Fix:** add a tri-state resting model in `getLANStatus()` — `disabled` (no URL configured) / `offline` (navigator.onLine false or no reachable hub) / `connected`. Don't poll a dead endpoint; back off when `navigator.onLine === false`. Surface "LAN disabled" distinctly from "offline" in the dock chip.

### 3.5 No model-status surface in the shell

NL→SQL (`nlq.ts`) and insights (`insights.ts`) fall back to rule-based logic when `isLLMReady()` is false, but the shell gives no indication of whether the local model is downloaded/cached. First-run users silently get degraded behavior.

**Fix:** add a small shell-level **model status pill** (next to the AI toggle or in the AI panel header) reading a `useLocalModelStatus()` hook: `not-downloaded` / `downloading (n%)` / `ready`. Models cache once to OPFS/IndexedDB (Tech Radar). This is a navigation/affordance concern that belongs in the shell.

### 3.6 Shell layout state not persisted

`collapsed`, `aiOpen`, AI `tab` are ephemeral `useState`. `settings-store` already has durable offline storage.

**Fix:** add a small persisted `shell` slice (or extend settings) and a `useShellState()` hook so layout survives reloads:

```ts
// extend settings-store or a new shell-store
interface ShellState {
  sidebarCollapsed: boolean;
  aiPanelOpen: boolean;
  aiPanelTab: "chat" | "insights";
  setSidebarCollapsed: (v: boolean) => void;
  setAiPanelOpen: (v: boolean) => void;
}
```

Persist via `createDrizzleStorage({ namespace: "shell" })`.

---

## 4. Better architecture & implementation (step by step)

### 4.1 Decompose the monolith (no behavior change)

1. Lift `NAV_SECTIONS`, `TELECOM_NAV_ITEMS`, `FOOTER_ITEMS`, `NavItem`, `DashboardUser`, `TelecomDashboardTab`, `ALL_ITEMS` into `nav/nav-config.ts` (no `"use client"`).
2. Extract `NavButton`, `AppSidebar`, `Topbar`, `DatasetPicker`, `AccessControlPill`, `GlobalDataSearch`, `CommandPalette` into the directory layout in §2.1.
3. Keep `DashboardLayout` as the composition root in `shell/dashboard-layout.tsx`.
4. Add regression Storybook stories per extracted component before moving code (the repo already has stories + `scripts/generate-component-stories.ts`).

### 4.2 Resizable, persistable AI/insights region

Today the AI panel is a fixed 440px overlay. Promote it to a resizable docked region using **react-resizable-panels** (the 2026 standard, bvaughn), persisting size offline:

```tsx
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

<PanelGroup direction="horizontal" autoSaveId="dashboard-shell" storage={drizzlePanelStorage}>
  <Panel defaultSize={70} minSize={40}>
    <main className="min-w-0 flex-1 overflow-auto">{children}</main>
  </Panel>
  {aiOpen && (
    <>
      <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40" />
      <Panel defaultSize={30} minSize={20} maxSize={50}>
        <AIPanelContent />
      </Panel>
    </>
  )}
</PanelGroup>
```

`storage` is a `{ getItem, setItem }` shim over the existing drizzle-storage so layout sizes persist offline. On small viewports, fall back to the current overlay behavior (the panel library degrades to a single panel). If the shell later needs true IDE-style tabbed/floating docking, **dockview** (zero-dep core, MIT, v6.6.1) is the TRIAL upgrade.

### 4.3 cmdk command palette as the universal launcher

Beyond navigation, the palette should also surface **datasets** and **actions** (toggle AI, switch theme, run last query). Use `cmdk` groups:

```tsx
<Command.Group heading="Pages">{/* nav items */}</Command.Group>
<Command.Group heading="Datasets">
  {datasets.map((d) => (
    <Command.Item key={d.id} value={`dataset ${d.name}`} onSelect={() => selectDataset(d.id)}>
      <Database className="h-4 w-4" /> {d.name}
    </Command.Item>
  ))}
</Command.Group>
<Command.Group heading="Actions">
  <Command.Item onSelect={toggleAi}>Toggle AI Copilot</Command.Item>
  <Command.Item onSelect={cycleTheme}>Cycle theme</Command.Item>
</Command.Group>
```

This consolidates `GlobalDataSearch` and `CommandPalette` into one accessible surface, removing a topbar popover and a duplicate listener.

### 4.4 Notifications wired to local activity-store

```tsx
// notifications-bell.tsx
const events = useActivityStore((s) => s.events);
const notifSettings = useSettingsStore((s) => s.notifications);
const visible = useMemo(
  () => events
    .filter((e) => notifSettings[e.category] ?? true)
    .slice(0, 20),
  [events, notifSettings],
);
const unread = visible.filter((e) => !e.read).length;
```

`addEvent` already fires on dataset selection; extend it from upload/query/error sites. Persist `events` (capped, e.g. last 200) via drizzle-storage so the bell is real and offline-durable.

### 4.5 Mobile / narrow-viewport navigation (currently missing)

The sidebar is `hidden md:flex` and the command palette is desktop-centric; **there is no mobile nav at all**. Add a `<700px` drawer:

```tsx
// app-sidebar-mobile.tsx — a motion drawer triggered by a hamburger in Topbar (shown <md)
{mobileOpen && (
  <motion.aside
    initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
    className="fixed inset-y-0 left-0 z-50 w-64 …"
  >
    {/* reuse the same NAV_SECTIONS map */}
  </motion.aside>
)}
```

Share `nav-config.ts` so desktop and mobile never drift.

### 4.6 Persisted shell state hook

```ts
// use-shell-state.ts
export function useShellState() {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const setCollapsed = useShellStore((s) => s.setSidebarCollapsed);
  const aiOpen = useShellStore((s) => s.aiPanelOpen);
  const setAiOpen = useShellStore((s) => s.setAiPanelOpen);
  return { collapsed, setCollapsed, aiOpen, setAiOpen };
}
```

`DashboardLayout` and `DashboardClientShell` consume this instead of local `useState`, so layout survives reload offline.

---

## 5. Recommended dependencies

| Dep | ~Stars | Maintenance | License | Offline | Bundle | Why |
|---|---|---|---|---|---|---|
| **cmdk** | 12.7k | Active (v1.1.1 Mar 2025); already a dep | MIT | yes | ~6kB gz | Accessible composable command menu. Already bundled (`command.tsx`). Replace hand-rolled palette → free a11y + focus trap. https://github.com/pacocoursey/cmdk |
| **fuse.js** | 18k | Active; already a dep | Apache-2.0 | yes | ~12kB gz | Reuse for ranked fuzzy palette/dataset search instead of `includes()`. Zero new cost. https://github.com/krisk/fuse |
| **react-resizable-panels** | 5.2k | Very active (v4.11.2, ~3wk; bvaughn) | MIT | yes | ~10kB gz | 2026 standard resizable layout. Make the AI/insights region dockable + persistable. https://github.com/bvaughn/react-resizable-panels |
| **tinykeys** | ~3.4k | Very active (v4.0.0 Jun 2026) | MIT | yes | ~650B | Centralize Cmd+K / Cmd+\\ / Cmd+B into one declarative map. https://github.com/jamiebuilds/tinykeys |
| **@tanstack/react-virtual** | 5.5k | Very active; already a dep | MIT | yes | ~6kB gz | Virtualize AI-panel result table + long palette lists. https://github.com/TanStack/virtual |
| **dockview** *(TRIAL)* | 3.3k | Very active (v6.6.1 May 2026); zero-dep core | MIT | yes | core zero-dep | Only if the shell grows into IDE-style tabbed/floating docking. https://github.com/mathuo/dockview |
| **react-hotkeys-hook** *(alt)* | ~6k | Very active (v5.3.2) | MIT | yes | ~5kB gz | Alternative to tinykeys with React-scoped enable/disable. Pick ONE. https://github.com/JohannesKlauss/react-hotkeys-hook |

**Net new runtime deps required for the core plan: `react-resizable-panels` + `tinykeys` only** (cmdk, fuse.js, react-virtual are already in `package.json`). Both are tiny, MIT, offline, medium-PC-friendly.

---

## 6. CLIs & tools (all offline)

- **@next/bundle-analyzer** (in repo): prove the AI-panel lazy-split lands and the shell chunk shrinks.
- **size-limit + @size-limit/preset-app + time plugin** (in repo): add a `/dashboard` route budget and an always-mounted-shell component budget; fail CI if the AI panel re-bundles into the shell.
- **react-scan** (dev dep): visually confirm the per-NavButton re-render storm is gone after §2.2 and topbar full-store subscriptions after §2.3.
- **knip** (in repo): after replacing the hand-rolled palette, flag dead helpers and confirm `command.tsx` is now referenced.
- **axe-core / @storybook/addon-a11y** (in repo): assert the cmdk palette and sidebar have proper roles — the current palette has none.
- **@lhci/cli** (offline vs localhost): track INP/CLS; the sidebar width animation and palette-open are the interaction-latency suspects.

---

## 7. Phased task list

### P1 — Decompose + correctness + biggest wins (no new deps except internal moves)
1. Split `sidebar-nav.tsx` per §2.1 / §4.1 into `nav/`, `topbar/`, `command/`, `shell/`; move metadata into `nav-config.ts` (no `"use client"`). Add stories first.
2. Memoize `NavButton`, lift active-state to parent (§2.2).
3. Narrow all `useDataStore` / store selectors in the topbar; memoize breadcrumbs; hoist `NOTIFS`/static literals (§2.3).
4. Lazy-load `AIPanel` via `next/dynamic` and only mount after first open (§2.4) — the headline first-paint win.
5. Stable keys + remove `JSON.stringify` keying in `ResultTable` (§2.6).
6. Offline correctness: initials-only avatar (§3.1); fix "DuckDB WASM" branding (§3.2).

### P2 — Adopt cmdk/fuse + tinykeys + persisted shell + wire real data
1. Replace hand-rolled `CommandPalette` with `cmdk` + `fuse.js` ranking; add Datasets/Actions groups; fold in `GlobalDataSearch` (§2.5, §4.3).
2. Centralize shortcuts with `tinykeys` (§2.9); single `useClickOutside` hook (§2.8).
3. Persisted shell-state slice via drizzle-storage (§3.6, §4.6).
4. Wire notifications bell to `activity-store` + settings filters; persist events (§3.3, §4.4).
5. LAN tri-state (`disabled`/`offline`/`connected`) + `navigator.onLine` gating (§3.4).
6. Model-status pill via `useLocalModelStatus()` (§3.5).

### P3 — Layout system + mobile + polish
1. Resizable, persistable AI/insights region with `react-resizable-panels` (§4.2); overlay fallback on narrow viewports.
2. Mobile nav drawer sharing `nav-config.ts` (§4.5).
3. Replace `motion` sidebar width animation with CSS transition / transform (§2.7); virtualize large result tables and palette lists with `@tanstack/react-virtual` (§2.6).
4. Add size-limit budgets + lhci assertions + axe checks to CI (§6); consider **dockview** TRIAL only if IDE-style docking becomes a requirement.

---

## 8. Summary of load-bearing facts

- `cmdk` (line 112), `fuse.js` (line 127), `@tanstack/react-virtual` (line 103) are **already dependencies** — the plan's core only needs `react-resizable-panels` + `tinykeys` net-new.
- `src/components/ui/command.tsx` already wraps cmdk but the dashboard palette ignores it.
- Sidebar is `hidden md:flex` with **no mobile nav**; command palette is desktop-only.
- AI panel (1289 lines) is **always mounted** by `DashboardClientShell` — the top first-paint cost.
- Shell layout state (collapsed/aiOpen/tab) is ephemeral while `settings-store` already has durable offline drizzle-storage to reuse.
- Notifications and the "DuckDB WASM" label are mock/misleading for an offline native-DuckDB Electron build.