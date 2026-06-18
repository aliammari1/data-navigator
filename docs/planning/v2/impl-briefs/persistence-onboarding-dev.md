# Impl Brief — Durable Persistence, Onboarding, Dev-Quality

**Cluster:** Durable persistence, onboarding, dev-quality
**Packages:** `dexie`, `dexie-react-hooks`, `driver.js`, `fuse.js`, `cmdk`, `tinykeys`, `@headless-tree/react` (+`@headless-tree/core`), `@tanstack/react-form`, `react-scan`, `size-limit` (+`@size-limit/preset-app`, `@size-limit/time`), `knip`, `@lhci/cli`, `sonda`, `web-vitals`

**Hard constraints (apply to EVERYTHING below):** fully offline (no runtime network/CDN), medium-end PC (4-core, no WebGPU, 8GB), current stable API. Source feature plans: `settings.md`, `help.md`, `ux-innovations.md`, `folders.md`, `history.md`, `briefs/offline-first-developer-tooling-clis-to-raise-quality-perf-o.md`.

---

## 0. Repo state you must build on (verified)

Already installed: `dexie ^4.4.3`, `fuse.js ^7.4.2`, `cmdk ^1.1.1`, `zod ^4.4.3`, `@tanstack/react-virtual ^3.14.2`, `zustand ^5.0.14`, `size-limit ^12.1.0`, `knip ^6.16.0`, `next ^16.2.7`, `react 19.2.6`, `electron ^41.7.1`.

**Net-new installs required** (exact latest stable, verified against npm registry June 2026):

```bash
# Runtime deps (ship in app)
npm i dexie-react-hooks@4.4.0 driver.js@1.4.0 tinykeys@4.0.0 \
      @headless-tree/react@1.7.0 @headless-tree/core@1.7.0 \
      @tanstack/react-form@1.33.0 web-vitals@5.3.0
# Dev-only deps (tooling)
npm i -D react-scan@0.5.7 @size-limit/preset-app@12.1.0 @size-limit/time@12.1.0 \
      @lhci/cli@0.15.1 sonda@0.13.0
```

`fuse.js`/`cmdk`/`dexie`/`zod` are present but UNUSED in the target features — wiring them is most of the win. Do NOT add `react-joyride`, `react-confetti-boom`, `@dexie-kit/migrate`, or any CDN `<script>` (all violate offline/clean-tree).

**Existing conventions to reuse (do not reinvent):**
- Dexie pattern lives in `src/platform/storage/app-db.ts`, `src/features/help/lib/onboarding-db.ts`, `src/features/report-studio/data/db.ts` — `class X extends Dexie`, `this.version(n).stores({...})`, `Table<T, KeyType>`. Match it.
- cmdk wrapper already exists: `src/components/ui/command.tsx` (exports `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`, `CommandEmpty`). A live palette is `src/features/dashboard-shell/command/command-palette.tsx`. Extend these, do not create a parallel cmdk tree.
- Zustand durable adapter: `createDrizzleStorage({ namespace })` from `src/platform/storage/drizzle-storage.ts` (SQLite write-through + localStorage warm copy). This is for **key→single-JSON-blob** settings. Dexie is for **many-small-rows / range-queryable logs**. Use the right one per §1.1.
- Layouts: `src/app/layout.tsx` (root), `src/app/dashboard/layout.tsx` (dashboard shell). Mount providers here.
- `next.config.ts` (TS, not mjs). Electron security/headers: `electron/security.ts`.

---

## 1. dexie + dexie-react-hooks — durable IndexedDB persistence

**Install:** `dexie@^4.4.3` (have), `dexie-react-hooks@4.4.0` (new). Apache-2.0. Pure JS, fully offline, worker-accessible.

### 1.1 When Dexie vs the existing drizzle-storage (DECIDE PER STORE)
- **Dexie** = many small structured rows you must **range-query / paginate / index** (history event log, onboarding/tour state, achievement event stream, feedback). localStorage-as-DB and "one JSON blob capped at 500" are the anti-patterns being replaced.
- **drizzle-storage (`createDrizzleStorage`)** = settings-style single-blob key/value that just needs durable rehydrate. Keep it for the settings store; do NOT migrate settings to Dexie.

### 1.2 Minimal correct init (matches repo convention)
```ts
// src/features/history/data/history-db.ts
import Dexie, { type Table } from "dexie";

export interface HistoryEvent {
  id: string;            // crypto.randomUUID()
  ts: number;            // epoch ms — primary sort
  day: string;           // "2026-06-12" — range/group index
  source: "activity" | "dataset" | "transform" | "query";
  type: string;
  message: string;
  datasetId?: string;
  tableName?: string;
}

class HistoryDB extends Dexie {
  events!: Table<HistoryEvent, string>;
  constructor() {
    super("data-navigator-history-v1");
    // index notation: "pk, idx1, idx2, [compound+index]"
    this.version(1).stores({
      events: "id, ts, day, source, datasetId, [source+ts], [day+source]",
    });
  }
}
export const historyDB = new HistoryDB();
```

### 1.3 Key API calls (current Dexie 4 signatures)
```ts
// append
await historyDB.events.add(evt);                 // throws on dup pk
await historyDB.events.put(evt);                  // upsert
await historyDB.events.bulkAdd(evts);

// indexed/paged read — NEVER load whole log into renderer
await historyDB.events.orderBy("ts").reverse().limit(2000).toArray();
await historyDB.events.where("[source+ts]")
  .between([src, Dexie.minKey], [src, before ?? Dexie.maxKey])
  .reverse().limit(limit).toArray();
await historyDB.events.where("source").equals("query").count();

// retention/compaction (run on boot/idle)
const old = await historyDB.events.orderBy("ts").limit(excess).primaryKeys();
await historyDB.events.bulkDelete(old);
```

**Schema migration (replacing localStorage-as-DB / bumping shape):** add a NEW `.version(n)` block; never edit an existing one. `.upgrade()` runs once per client when the on-disk version is lower:
```ts
this.version(2).stores({ events: "id, ts, day, source, datasetId, author, [source+ts], [day+source]" })
  .upgrade((tx) => tx.table("events").toCollection().modify((e) => { e.author ??= "local"; }));
```

### 1.4 React binding (dexie-react-hooks)
```ts
import { useLiveQuery } from "dexie-react-hooks";
// reactive, re-runs only when the queried table changes; default value avoids undefined flash
const events = useLiveQuery(
  () => historyDB.events.orderBy("ts").reverse().limit(2000).toArray(),
  [], []   // deps, initialValue
);
```

### 1.5 Offline / self-host requirements
- IndexedDB only — zero network. No assets to host.
- **Eviction:** call `await navigator.storage.persist()` ONCE at app startup (gate behind a flag in `src/app/dashboard/layout.tsx` effect) so the OS won't silently evict the DB under storage pressure. Surface `navigator.storage.estimate()` in the Settings → Storage panel (`{usage, quota}`).
- `crypto.randomUUID()` is available in Electron renderer (secure context). In a non-secure dev origin it can be absent — fall back to a ULID helper.
- IndexedDB is **async** — write through a zustand `subscribe` mirror (history.md §3.1) so the app-wide write API (the existing Zustand stores) stays synchronous; the Dexie copy becomes the queryable source of truth for the history/onboarding read paths only.

### 1.6 Wire-in targets
- `src/features/history/data/history-db.ts` + `history-mirror.ts` (store→Dexie subscribers + idempotent one-time backfill guarded by a `backfillVersion` row).
- `src/features/help/lib/onboarding-db.ts` — **already a Dexie file**; extend it with `tours` (`tourId` pk) and `seen` (`featureId` pk) tables via a `.version(2)` bump. Do not create a second onboarding DB.
- `src/features/ux-innovations/store/` — achievement unlocks + capped event stream → Dexie (replaces synchronous localStorage parse-per-call).
- Quota/persist surface: `src/features/settings/` Storage panel; startup persist() call in `src/app/dashboard/layout.tsx`.

### 1.7 Pitfalls
- IndexedDB cannot store live React elements / functions / class instances — store plain clone-safe data (see `toCloneSafeValue` in `app-db.ts`). `ArrayBuffer`/typed arrays are OK.
- Compound index `[source+ts]` must be declared in `stores()` to be queryable; `between` needs `Dexie.minKey`/`Dexie.maxKey` bounds, not `0`/`Infinity`, for correct ordering on compound keys.
- One Dexie instance per DB name as a module singleton — never `new` it inside a component.
- Bumping `version()` is required for ANY index change; forgetting it throws `SchemaError`/`VersionError` at open.

---

## 2. driver.js — onboarding / product tour (replaces react-joyride dead code)

**Install:** `driver.js@1.4.0`. MIT, ~5KB gz, zero deps, framework-agnostic, no network/analytics.

### 2.1 Minimal correct init + CSS (current v1 API)
```ts
import { driver, type Driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";   // bundled locally by the bundler — NOT a CDN

const d: Driver = driver({
  showProgress: true,
  allowClose: true,
  overlayColor: "rgba(0,0,0,0.55)",
  steps: [
    { element: '[data-tour="telecom-report"]',
      popover: { title: "Telecom Report", description: "Daily transaction analytics.", side: "right", align: "start" } },
    { element: "body", popover: { title: "Welcome", description: "2-minute offline tour.", align: "center" } },
  ],
  onDestroyed: () => { /* persist completion to Dexie */ },
});
d.drive();      // start at step 0
```

### 2.2 Key API (verified signatures)
- Top-level `Config`: `steps`, `showProgress`, `showButtons`, `allowClose`, `overlayColor`, `stagePadding`, `onHighlightStarted(el, step, opts)`, `onDeselected`, `onDestroyed`, `onNextClick(el, step, opts)`, `onPrevClick`.
- `DriveStep`: `{ element?: Element | string | (() => Element); popover?: Popover }`.
- `Popover`: `{ title?, description?, side?: "top"|"right"|"bottom"|"left", align?: "start"|"center"|"end", showButtons?: ("next"|"previous"|"close")[], onNextClick? }`.
- Methods: `drive(stepIndex?)`, `moveNext()`, `movePrevious()`, `moveTo(i)`, `destroy()`, `hasNextStep()`, `isActive()`.

### 2.3 Offline / self-host
- Fully offline. The ONLY asset is `driver.js/dist/driver.css` — import it in the tour-runner module so the bundler inlines it. No fonts/images.

### 2.4 Wire-in (the missing piece: it must actually be MOUNTED)
- `src/features/help/lib/tour-runner.ts` — wrap driver with **route navigation between steps** (App Router `router.push`) + **skip-if-missing**: filter `steps` to those whose `element === "body" || document.querySelector(el)`, and in `onNextClick` await a `waitForSelector(nextStep.element, 4000)` poll before `d.moveNext()`.
- `src/features/help/data/tours.ts` — `TourDefinition[]`; anchor steps on durable `data-tour="..."` attributes (NOT transient `[href]`), carry optional `route`.
- `src/features/help/providers/OnboardingProvider.tsx` — auto-start the global tour on first run (check Dexie `tours.get(GLOBAL_TOUR.id)`); **mount it in `src/app/dashboard/layout.tsx`**. Persist completion in Dexie `tours` table (§1.6), not localStorage.
- Add `data-tour` anchors on real dashboard pages; reuse existing orphan anchors `data-tour="deep-analytics"` / `data-tour="reconciliation"`.

### 2.5 Pitfalls
- Imperative/singleton: keep ALL driver.js usage inside `tour-runner.ts`; bridge React state through it. Steps targeting absent elements stall the tour — always skip-if-missing.
- `react-joyride` uses `callback`/flat props; do NOT copy the old `OnboardingTour.tsx` `onEvent`/`options={...}` shape — it is wrong v3 usage and is being deleted. Run `knip` to confirm `react-joyride` becomes unused, then drop it.

---

## 3. fuse.js — indexed ranked fuzzy search (already installed, unused)

**Install:** `fuse.js@^7.4.2` (have). Apache-2.0, ~12KB gz, in-memory, offline.

### 3.1 Minimal correct init (Fuse 7 API)
```ts
import Fuse from "fuse.js";

const fuse = new Fuse(FEATURES, {
  keys: [
    { name: "title", weight: 3 },
    { name: "summary", weight: 1 },
    { name: "tips", weight: 0.5 },   // array-of-strings field is supported
  ],
  threshold: 0.35,        // 0 = exact, 1 = match anything (default 0.6)
  ignoreLocation: true,   // search whole string, not just the start — IMPORTANT for titles/bodies
  minMatchCharLength: 2,
});
const results = fuse.search(query);       // [{ item, refIndex, score }]
const items = results.map((r) => r.item);
```

### 3.2 Pre-built / serializable index (for larger corpora)
```ts
const myIndex = Fuse.createIndex(["title", "summary"], FEATURES);
const fuse = new Fuse(FEATURES, options, myIndex);
// Note (verified gotcha, krisk/Fuse #446): createIndex takes keys as STRING[] only,
// NOT weighted-object notation. Pass weights via the options.keys to the constructor.
```

### 3.3 React perf pattern (build once, defer input)
```ts
const fuse = useMemo(() => new Fuse(nodes, options), [nodes]);   // index built once per data change
const deferred = useDeferredValue(query.trim());                  // keeps typing at 60fps
const hits = useMemo(() => deferred ? fuse.search(deferred).map(r => r.item) : nodes, [fuse, deferred]);
```

### 3.4 Offline / self-host
None — pure JS, builds index in memory. No assets.

### 3.5 Wire-in
- `src/features/help/lib/use-help-search.ts` (replace naive `.includes` in `HelpScreen.tsx`).
- `src/features/folders/hooks/useFolderSearch.ts` (keys: `name`, `tags`, `description`; replace `.toLowerCase().includes`).
- History search may use Fuse too, but the plan prefers `@leeoniya/uFuzzy` there (not in this cluster) — for THIS cluster, Fuse covers help + folders.

### 3.6 Pitfalls
- Default `threshold` 0.6 is too loose and `ignoreLocation` default `false` only matches near string start — always set `threshold: ~0.35` + `ignoreLocation: true` or results feel broken.
- `new Fuse(...)` re-indexes on every call — memoize on the data array, never inside render.
- `weight` must be `> 0`; values `>= 1` are fine in v7 (older error was a bug).

---

## 4. cmdk — command palette (already installed + wrapped)

**Install:** `cmdk@^1.1.1` (have). MIT, ~6KB gz, offline.

### 4.1 Current API (the repo already wraps it)
Use the existing `src/components/ui/command.tsx` exports. The cmdk primitive components: `Command` (root), `Command.Input`, `Command.List`, `Command.Empty`, `Command.Group`, `Command.Item`, `Command.Separator`, `Command.Dialog`.
```tsx
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Search commands…" value={query} onValueChange={setQuery} />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>
    <CommandGroup heading="Help">
      <CommandItem value="open-help" onSelect={() => router.push("/dashboard/help")}>Open Help</CommandItem>
      <CommandItem value="start-tour" onSelect={() => tours.start(GLOBAL_TOUR)}>Start guided tour</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### 4.2 Key props
- `Command` root: `value`/`onValueChange` (controlled active item), `shouldFilter` (set `false` when you filter manually, e.g. when feeding Fuse results or async loading), `filter` (custom rank fn `(value, search, keywords?) => number`), `loop`.
- `Command.Item`: `value` (unique; auto-inferred from `textContent` if omitted), `onSelect(value)`, `keywords` (search aliases), `disabled`.
- `Command.Input`: `value` / `onValueChange`.

### 4.3 Offline / self-host
None — pure React. No assets.

### 4.4 Wire-in
- Extend `src/features/dashboard-shell/command/command-palette.tsx` with a "Help" group (Open Help, Start guided tour, Jump to feature X) so help/tours are reachable from any route offline. Open it via tinykeys (§5), not a bespoke keydown.

### 4.5 Pitfalls
- Built-in fuzzy filtering and your Fuse index are two filters — if you pre-filter items with Fuse, set `shouldFilter={false}` to avoid double-filtering/empty lists.
- Every `Command.Item` needs a stable unique `value`; duplicate/auto-inferred values collide and break selection.

---

## 5. tinykeys — keybindings (new)

**Install:** `tinykeys@4.0.0`. MIT, ~650B, zero deps, offline.

### 5.1 Minimal correct init
```ts
import { tinykeys } from "tinykeys";   // named export

// returns an unsubscribe function
const unsubscribe = tinykeys(window, {
  "$mod+k": (e) => { e.preventDefault(); setPaletteOpen(true); },  // $mod = Cmd on Mac, Ctrl elsewhere
  "$mod+Slash": () => router.push("/dashboard/help"),
  "g h": () => router.push("/dashboard/history"),                  // space-separated = key sequence
});
// later:
unsubscribe();
```
React usage: register inside `useEffect(() => { const un = tinykeys(window, map); return un; }, [deps])`.

### 5.2 Key API
- `tinykeys(target: Window | HTMLElement, map: KeyBindingMap, options?) => () => void`.
- `createKeybindingsHandler(map)` → a `keydown` handler you attach yourself (use when you need a non-window target or custom listener options).
- Binding syntax: `$mod` (Ctrl/Cmd), `Shift+`, `Alt+`, physical `KeyD`/`Slash` codes, and space-separated sequences (`"g h"`). `KeyBindingMap = Record<string, (e: KeyboardEvent) => void>`.

### 5.3 Offline / self-host
None.

### 5.4 Wire-in
- `src/platform/keybindings/` (new) or inside `dashboard-shell` — single global registrar mounted in `src/app/dashboard/layout.tsx`. Drive: open command palette (`$mod+k`), open help (`$mod+Slash`). Replace any hand-rolled `keydown`/`metaKey` listeners (none found in the palette today — it likely relies on a click; add the shortcut here).

### 5.5 Pitfalls
- Register once per mount and ALWAYS return the unsubscribe from the effect, or you leak listeners across HMR/navigation.
- Sequence bindings (`"g h"`) fire only outside inputs by default behavior expectations — guard against firing while a text field / the cmdk input is focused if a single-letter sequence would interfere.

---

## 6. @headless-tree/react — headless virtualized ARIA tree (new; folders)

**Install:** `@headless-tree/react@1.7.0` + `@headless-tree/core@1.7.0`. MIT. Headless (you render), zero runtime assets, offline. Pairs with the already-installed `@tanstack/react-virtual`.

### 6.1 Minimal correct init
```ts
import { useTree } from "@headless-tree/react";
import {
  syncDataLoaderFeature,   // sync data via getItem/getChildren
  selectionFeature,
  hotkeysCoreFeature,      // keyboard nav (arrows, home/end)
  dragAndDropFeature,
  searchFeature,           // typeahead
  expandAllFeature,
} from "@headless-tree/core";

const tree = useTree<FSNode>({
  rootItemId: "root",
  initialState: { expandedItems: ["root"] },
  getItemName: (item) => item.getItemData().name,
  isItemFolder: (item) => item.getItemData().type === "folder",
  dataLoader: {
    getItem: (id) => index.byId.get(id)!,                                  // O(1) from your flat index
    getChildren: (id) => (index.childrenOf.get(id) ?? []).map((n) => n.id),
  },
  onDrop: (items, target) => {
    const targetId = target.item.getId();
    for (const it of items) {
      const data = it.getItemData();
      if (data.type === "folder") storeMoveFolder(data.id, targetId === "root" ? null : targetId);
      else storeMoveDataset(data.id, targetId === "root" ? null : targetId);
    }
  },
  features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, dragAndDropFeature, searchFeature, expandAllFeature],
});
```

### 6.2 Render loop (current ItemInstance API — verified surface)
```tsx
<div {...tree.getContainerProps()} className="h-full overflow-y-auto" role="tree">
  {tree.getItems().map((item) => (
    <button
      key={item.getId()}
      {...item.getProps()}                                  // role=treeitem, aria-expanded/selected, handlers
      style={{ paddingLeft: `${item.getItemMeta().level * 16}px` }}
      data-focused={item.isFocused() || undefined}
      data-selected={item.isSelected() || undefined}
    >
      {item.isFolder() ? (item.isExpanded() ? "▾" : "▸") : "·"} {item.getItemName()}
    </button>
  ))}
</div>
```
Item methods: `getId()`, `getItemData()`, `getItemName()`, `getItemMeta().level` (depth for indent), `isFolder()`, `isExpanded()`, `isSelected()`, `isFocused()`, `getProps()`. Tree methods: `getContainerProps()`, `getItems()` (returns the flat, virtualization-ready visible list), plus selection/expand/search state.

### 6.3 Virtualization (pair with @tanstack/react-virtual, already installed)
`tree.getItems()` is a flat array → feed `.length` to `useVirtualizer({ count, getScrollElement, estimateSize: () => 30, overscan: 12 })` and render only `getVirtualItems()` windows, applying `{...item.getProps()}` to the windowed rows (see `folders.md` §2.2 / `viz-virtualization.md`). DOM nodes stay ~visible+overscan regardless of catalog size.

### 6.4 Offline / self-host
None — headless, no CSS/asset shipped (you own styling). No COOP/COEP requirement.

### 6.5 Wire-in
- `src/features/folders/components/FolderTree.tsx` + `FolderTreeRow.tsx`; hooks `useFolderIndex.ts` (`byId` + `childrenOf` maps, O(1)), `useFlattenVisible.ts`. Replace the hand-rolled recursive `TreeNode` + manual `DragState`/`expanded`/`selected` in `FoldersScreen.tsx`.
- Keep the store's `moveFolder` **descendant-cycle guard** (folders-store.ts) as the backstop for DnD — headless-tree won't prevent A→A/child cycles for you.

### 6.6 Pitfalls
- It is HEADLESS: ARIA roles/keyboard come from `getContainerProps()`/`getProps()` — you MUST spread them; rolling your own `<div role="button">` rows loses the a11y win (axe-core will still flag the old rows).
- `getItem` must be total (never return `undefined` for a valid id) or the tree throws; back it with your `byId` Map and assert.
- Feature order in the `features` array matters (core features first); `syncDataLoaderFeature` is required for the sync `getItem`/`getChildren` loader shown above (use `asyncDataLoaderFeature` only if you load children lazily).

---

## 7. @tanstack/react-form — validated forms with Zod (new)

**Install:** `@tanstack/react-form@1.33.0`. MIT. Headless, type-safe, offline.

### 7.1 Zod integration — NO adapter needed (current API)
TanStack Form v1 consumes **Standard Schema** directly. Zod v4 (the repo's `^4.4.3`) implements Standard Schema, so pass the zod schema straight to `validators`. Do NOT install `@tanstack/zod-form-adapter` (deprecated/removed in v1).

### 7.2 Minimal correct init
```tsx
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

const ChangePassword = z.object({
  current: z.string().min(8),
  next: z.string().min(8),
  confirm: z.string(),
}).refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function ChangePasswordForm() {
  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onChange: ChangePassword },          // schema runs on every change
    onSubmit: async ({ value }) => {
      const { error } = await authClient.changePassword({ currentPassword: value.current, newPassword: value.next });
      error ? toast.error(error.message) : toast.success("Password updated");
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
      <form.Field name="current" children={(field) => (
        <>
          <input type="password" value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
          {!field.state.meta.isValid && <em role="alert">{field.state.meta.errors.join(", ")}</em>}
        </>
      )} />
      {/* next, confirm … */}
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <button type="submit" disabled={!canSubmit}>{isSubmitting ? "…" : "Save"}</button>
        )} />
    </form>
  );
}
```

### 7.3 Key API (verified)
- `useForm({ defaultValues, validators: { onChange|onBlur|onSubmit: schema, onSubmitAsync }, onSubmit })`.
- Field render-prop receives `field`: `field.state.value`, `field.handleChange(v)`, `field.handleBlur()`, `field.state.meta.errors` (string[]), `field.state.meta.isValid`, `field.name`.
- Field-level schema + async: `<form.Field validators={{ onChange: zSchema, onChangeAsync, ... }} asyncDebounceMs={500} />`.
- `form.handleSubmit()`, `form.Subscribe({ selector, children })`, `form.store` (use with `useStore` for `errorMap`).

### 7.4 Offline / self-host
None — headless, no assets.

### 7.5 Wire-in
- `src/features/settings/components/panels/account-panel.tsx` — change-password + sign-in/up (better-auth). This is the one genuine form surface.
- For numeric settings (rowLimit, duckdbWorkers, etc.) the plan says full form machinery is overkill — use a controlled-draft `<input>` + zod-on-blur (`SettingsSchema` clamp) instead; reserve react-form for the Account forms.

### 7.6 Pitfalls
- Standard Schema requires Zod v4+ (have). On older Zod the direct-schema path silently won't validate.
- `onChange: schema` validates the WHOLE form object on each keystroke — fine for small auth forms; for big forms prefer field-level `validators`.
- Errors are `string[]` (`meta.errors`); with raw Standard Schema issues use `form.store` + `useStore(form.store, s => s.errorMap)` and flatten `issue.message`.

---

## 8. react-scan — re-render profiler (dev-only; new)

**Install:** `react-scan@0.5.7` (devDependency). MIT. Runs entirely in-browser, offline.

### 8.1 Correct setup — npm import, NOT the CDN script
```tsx
// src/components/dev/ReactScan.tsx
"use client";
import { useEffect } from "react";
export function ReactScan() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      import("react-scan").then(({ scan }) => scan({ enabled: true, log: true }));
    }
  }, []);
  return null;
}
```
Mount as the **topmost** node in `src/app/layout.tsx` so it initializes before React mounts your tree:
```tsx
import { ReactScan } from "@/components/dev/ReactScan";
// <html><ReactScan /><body>{children}</body></html>
```

### 8.2 Offline / self-host
The `react-scan` import path runs **dev-only** and never in production builds. NEVER use the documented `https://unpkg.com/react-scan` `<script>` tag — that requires network and violates the offline constraint. (`react-scan/all-environments` is the prod path; do not use it here.)

### 8.3 Wire-in
- Dev verification of the re-render storms named in the plans: Settings per-keystroke whole-tree re-render (settings.md), help list re-animation, folders O(N²)/`drag.over` churn, history full-list re-render. No CI gating — it is an interactive dev tool. Pair with the bundled React DevTools Profiler.

### 8.4 Pitfalls
- Importing it unconditionally ships it to production — keep the `NODE_ENV` guard and dynamic import.

---

## 9. size-limit (+ @size-limit/preset-app, @size-limit/time) — per-route/per-worker budgets

**Install:** `size-limit@^12.1.0` (have) + `@size-limit/preset-app@12.1.0` + `@size-limit/time@12.1.0` (dev). MIT. Runs bundle in bundled headless Chromium locally — offline.

### 9.1 Current config — replace the single blunt budget
Today: one `size-limit: [{ path: ".next/static/chunks/*.js", limit: "1800 kB", gzip: true }]`. Replace with per-surface byte AND parse/eval-time budgets (preset-app + time plugin enables `ms` limits — critical for the 4-core target):
```jsonc
// package.json
"size-limit": [
  { "name": "App shell (gzip)",            "path": ".next/static/chunks/main-*.js", "limit": "180 kB", "gzip": true },
  { "name": "Settings route + parse time", "path": ".next/static/chunks/app/dashboard/settings/**/*.js", "limit": "350 ms" },
  { "name": "Help route (gzip)",           "path": ".next/static/chunks/app/dashboard/help/**/*.js",     "limit": "150 kB", "gzip": true },
  { "name": "Folders route (gzip)",        "path": ".next/static/chunks/app/dashboard/folders/**/*.js",  "limit": "250 kB", "gzip": true },
  { "name": "History route (gzip)",        "path": ".next/static/chunks/app/dashboard/history/**/*.js",  "limit": "60 kB",  "gzip": true },
  { "name": "ML worker bundle",            "path": "build/workers/*.js", "limit": "2 mb", "gzip": true }
]
```
`@size-limit/preset-app` (file + webpack + time plugins) is the preset to add to devDeps so `ms` time limits work. Script already exists: `"size": "size-limit"` — wire it into `quality`/`ci`.

### 9.2 Offline / self-host
Uses a locally-bundled headless Chromium; no network. Time plugin self-calibrates CPU throttling vs a low-end Android baseline.

### 9.3 Wire-in / pitfalls
- Next.js chunk filenames are hashed — glob with `**/*.js` per route folder, not exact names.
- `ms` (time) limits require preset-app/time plugin installed, else they're ignored.
- `@next/bundle-analyzer` is already wired (`ANALYZE=true`) and sees only the webpack graph; for **worker** bundles use Sonda (§12).

---

## 10. knip — strict dead-code/dep gate (already installed, ungated)

**Install:** `knip@^6.16.0` (have). ISC. Static analysis, offline.

### 10.1 Config (`knip.json` at repo root — none exists yet)
```jsonc
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/app/**/{page,layout,route,loading,error,not-found}.tsx",
    "electron/main.ts",
    "src/**/*.worker.ts",
    "scripts/*.{mjs,ts}"
  ],
  "project": ["src/**/*.{ts,tsx}", "electron/**/*.ts", "scripts/**/*.{ts,mjs}"],
  // ML/inference workers are loaded by dynamic string path — whitelist so they aren't flagged unused:
  "ignoreDependencies": ["onnxruntime-web"],
  "next": true, "vitest": true, "storybook": true, "playwright": true
}
```
Scripts:
```jsonc
"check:dead": "knip",
"check:dead:ci": "knip --strict"   // --strict implies --production: only direct deps, ships-to-users surface
```

### 10.2 Offline / self-host
None — pure static analysis.

### 10.3 Wire-in
- Use it to PROVE the dead-code removals the plans call for: `react-joyride`/`OnboardingTour.tsx` (help/ux), `react-confetti-boom`, orphan `history/model/diff.ts` + `history-widgets.tsx`, fake fixtures, unused `folders.ts` query hooks. Gate `check:dead:ci` in `quality`/`ci`.

### 10.4 Pitfalls
- Heavy ML workers (`@huggingface/transformers`, `@mlc-ai/web-llm`, `@ricky0123/vad-web`, `sherpa-onnx-node`, `kokoro-js`) are dynamically imported — add to `ignoreDependencies`/`entry` so `--strict` doesn't false-positive them, but DO let knip flag genuinely dead UI deps.
- `--strict` ignores devDependencies and workspaces — run plain `knip` locally for full devDep/test cleanup, `--strict` only as the CI gate.

---

## 11. @lhci/cli — offline Lighthouse audit (new)

**Install:** `@lhci/cli@0.15.1` (dev). Apache-2.0. Bundled Chromium, runs against localhost — offline.

### 11.1 Config — nothing leaves the machine (`lighthouserc.js`)
```js
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start",                 // next start on localhost:3000
      url: ["http://localhost:3000/dashboard/help", "http://localhost:3000/dashboard/settings",
            "http://localhost:3000/dashboard/folders", "http://localhost:3000/dashboard/history"],
      numberOfRuns: 3,
      settings: { preset: "desktop", throttlingMethod: "simulate" },  // model the medium-end PC
    },
    assert: { assertions: {
      "categories:performance": ["warn", { minScore: 0.8 }],
      "categories:accessibility": ["error", { minScore: 0.95 }],
      "total-blocking-time": ["warn", { maxNumericValue: 400 }],
    }},
    upload: { target: "filesystem", outputDir: "./.lighthouseci" },   // NO cloud, NO LHCI server
  },
};
```
Script: `"audit:lh": "lhci autorun"`.

### 11.2 Offline / self-host (CRITICAL)
`upload.target: "filesystem"` is mandatory — the default `temporary-public-storage` UPLOADS to a public Google server (network + data leak). Always set filesystem. Lighthouse needs a browser + a URL, not the internet; pointing at your own `next start` is fully offline. In Electron you can also drive it at the renderer via `--remote-debugging-port=9222`.

### 11.3 Wire-in / pitfalls
- Add `.lighthouseci/` to `.gitignore`.
- Don't run `lhci autorun` against a route needing auth without seeding a session; the dashboard routes may require a logged-in better-auth session — either disable auth for the audit env or pre-authenticate.

---

## 12. sonda — offline bundle treemap incl. workers (new)

**Install:** `sonda@0.13.0` (dev). MIT. Generates a self-contained HTML report from disk — offline.

### 12.1 Next.js setup (`next.config.ts` is TS in this repo)
```ts
import Sonda from "sonda/next";
const withSonda = Sonda({ format: "html" });   // options: format, filename, deep, server
const config = {
  productionBrowserSourceMaps: true,            // REQUIRED — Sonda reads source maps
  /* …existing config… */
};
export default withSonda(config);
```
For the esbuild **worker** build (`esbuild.workers.mjs`) add the plugin there with `sourcemap: true`:
```js
import Sonda from "sonda/esbuild";
// plugins: [ Sonda({ format: "html" }) ]
```

### 12.2 Offline / self-host
Self-contained interactive HTML report opened from disk; no network. Needs source maps (`productionBrowserSourceMaps: true` for Next; `sourcemap: true` for esbuild).

### 12.3 Wire-in / pitfalls
- Keep `@next/bundle-analyzer` for the Next webpack graph; add Sonda specifically for the **esbuild worker bundles** (`@next/bundle-analyzer` is blind to those — that's where the ONNX/LLM/VAD weight is).
- Gate behind an env flag (like `ANALYZE`) so `productionBrowserSourceMaps` isn't always on in normal builds.

---

## 13. web-vitals — offline local RUM (new, optional)

**Install:** `web-vitals@5.3.0`. Apache-2.0, ~2KB. No server required — offline.

### 13.1 Minimal correct init (v5 API)
```ts
import { onLCP, onINP, onCLS, onTTFB, onFCP } from "web-vitals";
// or attribution build for debugging: import { onLCP } from "web-vitals/attribution";
import { vitalsDB } from "@/platform/storage/vitals-db";   // Dexie sink — NEVER a network endpoint

const sink = (m: { name: string; value: number; rating: string }) =>
  vitalsDB.vitals.add({ ...m, ts: Date.now() });
onLCP(sink); onINP(sink); onCLS(sink); onTTFB(sink); onFCP(sink);
```

### 13.2 Offline / self-host
You choose the sink — write to Dexie/IndexedDB (§1), surface in a dev panel. Nothing leaves the device. Do not POST to any endpoint.

### 13.3 Wire-in / pitfalls
- Call each `on*()` EXACTLY ONCE per page load (each registers a `PerformanceObserver`; repeated calls leak). Register in one module mounted once in `src/app/dashboard/layout.tsx`.
- Use `web-vitals/attribution` only in dev (heavier) for root-causing INP/LCP.

---

## 14. Cross-cutting offline notes

- **No asset/wasm/model/tile/font** is required by ANY package in this cluster. The only bundled static assets are `driver.js/dist/driver.css` (import it; bundler inlines it). Everything else is pure JS.
- **No COOP/COEP / SharedArrayBuffer** requirement from this cluster — those apply to the ML/WASM-threads workers (other clusters), set in `electron/security.ts`; nothing here needs them.
- **No CDN script tags** anywhere: react-scan via npm import (not unpkg), driver.css via bundler (not CDN), web-vitals to Dexie (not an endpoint), lhci `upload.target: "filesystem"` (not public storage).
- **IndexedDB eviction is the one durable-data trap:** call `navigator.storage.persist()` once at startup or the OS can wipe Dexie data (history, onboarding, achievements) under storage pressure.
- **Dexie schema migrations:** every index change needs a NEW `.version(n).stores(...)` block + optional `.upgrade()`; this is how localStorage-as-DB is replaced safely across app upgrades.

---

## Sources
- Dexie: [Typescript guide](https://dexie.org/docs/Typescript), [Dexie.js docs](https://dexie.org/docs/Dexie.js), [npm](https://www.npmjs.com/package/dexie)
- driver.js: [API reference](https://driverjs.com/docs/api), [basic usage](https://driverjs.com/docs/basic-usage), [configuration](https://driverjs.com/docs/configuration)
- fuse.js: [Options](https://www.fusejs.io/api/options.html), [using with React](https://www.fusejs.io/articles/using-fuse-with-react.html), [createIndex weighted-keys note (#446)](https://github.com/krisk/Fuse/issues/446)
- cmdk: [npm](https://www.npmjs.com/package/cmdk), [cmdk.paco.me](https://cmdk.paco.me/)
- tinykeys: [npm](https://www.npmjs.com/package/tinykeys), [README](https://github.com/jamiebuilds/tinykeys/blob/main/README.md)
- @headless-tree: [Get Started](https://headless-tree.lukasbach.com/getstarted/), [react-compiler guide](https://headless-tree.lukasbach.com/guides/react-compiler/), [npm @headless-tree/react](https://www.npmjs.com/package/@headless-tree/react)
- @tanstack/react-form: [validation guide](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [npm](https://www.npmjs.com/package/@tanstack/react-form)
- react-scan: [Next.js App Router setup](https://github.com/aidenybai/react-scan/blob/main/docs/installation/next-js-app-router.md), [npm](https://www.npmjs.com/package/react-scan)
- size-limit: [GitHub](https://github.com/ai/size-limit), [@size-limit/preset-app](https://www.npmjs.com/package/@size-limit/preset-app)
- knip: [Production Mode](https://knip.dev/features/production-mode), [Configuration](https://knip.dev/reference/configuration)
- @lhci/cli: [lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci)
- sonda: [Next.js setup](https://sonda.dev/frameworks/nextjs), [esbuild setup](https://sonda.dev/bundlers/esbuild), [GitHub](https://github.com/filipsobol/sonda)
- web-vitals: [npm](https://www.npmjs.com/package/web-vitals), [README](https://github.com/GoogleChrome/web-vitals/blob/main/README.md)
