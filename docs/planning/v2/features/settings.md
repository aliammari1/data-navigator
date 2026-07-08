# Feature Plan — settings — App settings (conf, better-auth) + forms

**Maturity:** partial

## Performance issues

- Whole-store subscription: SettingsScreen and sidebar-nav call useSettingsStore() with no selector, so every keystroke/toggle re-renders the entire 738-line screen tree (all 6 tab panels are mounted conditionally but the component re-runs fully). Use selector slices + useShallow.
- Every control write fans out an immediate /api/settings PUT (settingPath fetch) on each onChange. Dragging the duckdbWorkers range slider or typing in the rowLimit number input fires one HTTP round-trip + one drizzle better-sqlite3 upsert per intermediate value — a write storm. Needs debounce/coalesce.
- AnimatePresence mode="wait" + motion.div keyed on activeTab re-mounts and re-animates the full panel on every tab switch, and animations run even when store.animationsEnabled is false (the setting is never consulted). Respect prefers-reduced-motion and the animationsEnabled flag.
- No zod validation/coercion on numeric inputs: defaultRowLimit, virtualizeThreshold, maxMemoryMB accept Number(e.target.value) directly, so empty/NaN/out-of-range values are persisted verbatim and propagate to DuckDB/virtualization consumers.
- Performance settings (duckdbWorkers, maxMemoryMB, enableWASMStreaming, virtualizeThreshold) are write-only orphans — nothing reads them to configure the DuckDB worker pool or TanStack Virtual, so the 'Performance' tab is pure theater and gives users false control.
- Theme is double-sourced: theme-provider persists to localStorage['theme'] while settings-store persists theme to data-navigator-settings/drizzle. The Settings screen's setTheme updates the store only, so the theme toggle in Settings does nothing — and the two can drift.
- accentColor, density, compactNumbers, animationsEnabled are persisted but never injected as CSS variables / data-attributes on documentElement, so changing them has zero visual effect. No central settings-effects applier.
- The 'Save' button is a no-op (just a 2s checkmark) — persistence already happens on every change — which is misleading and adds an extra render cycle via setSaved state.

## Offline gaps

- better-auth baseURL defaults to http://localhost:3000 and BETTER_AUTH_URL/Origin checks are known to break Electron custom protocols (better-auth issues #7149, #7793). On a fully-offline Electron build with a file://-style or custom protocol, sign-in/session cookies can fail; needs trustedOrigins + a custom-protocol-safe baseURL.
- BETTER_AUTH_SECRET falls back to a hardcoded 'data-navigator-local-dev-secret-change-me' — fine for single-user offline but must be generated/persisted locally (e.g. in Electron userData) so sessions survive restarts and aren't a shipped constant.
- No 'Account' settings tab surfaced in SettingsScreen at all despite better-auth being wired (login/signup pages exist) — users can't see/change password, sign out, or view session from settings.
- Settings export/import is server-only (exportAppSettingsRemote) with no UI; there is no offline JSON backup/restore button, so a user wiping their profile loses all preferences even though drizzle holds them.
- The About tab hardcodes version strings ('DuckDB WASM 1.33.1', 'Framer Motion 11', 'v2.0.0') that will silently lie offline; should read from a bundled build-info JSON.
- No quota/storage surfacing: navigator.storage.estimate()/persist() (per Tech Radar Domain 1) is never called or shown, so an offline user can't see how much OPFS/IndexedDB/model-cache space settings + cached models consume.
- No model-management surface in settings (which local LLM/embedding/STT models are cached, their size, clear-cache) even though the app caches HF/sherpa/Piper models to IndexedDB/OPFS — a natural offline-app settings concern.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `zod` | validation | 39k | Very active; v4.x (already in package.json ^4.4.3) | MIT | yes | hand-rolled Number() casts | Already a dependency. Use it to define a single SettingsSchema for coercion/clamping (z.coerce.number().min().max()) so numeric inputs can never persist NaN/out-of-range values, and to validate imported settings JSON on restore. | https://github.com/colinhacks/zod |
| `@tanstack/react-form` | forms | 5k | Very active (TanStack org); growing | MIT | yes | uncontrolled inline inputs | Headless, type-safe, first-class Zod adapter; ideal for the new Account tab (password change, profile) and any validated numeric settings where field-level validation + dirty tracking matters. Lighter coupling than RHF for the small forms here, and matches the project's existing TanStack stack (Table/Virtual/Query). | https://github.com/TanStack/form |
| `react-hook-form` | forms | 43k | Very active; 12M weekly downloads | MIT | yes | uncontrolled inline inputs | Alternative to TanStack Form if the team prefers the de-facto standard: uncontrolled inputs minimize re-renders (directly fixes the per-keystroke re-render issue), zodResolver via @hookform/resolvers. Pick ONE of TanStack Form / RHF, not both. | https://github.com/react-hook-form/react-hook-form |
| `radix-ui` | ui-primitives | 16k | Very active; Select/Slider/Switch stable | MIT | yes | custom Toggle/Select/range controls | ALREADY in package.json (^1.5.0). Replace the hand-rolled Toggle (a bare button), native <select>, and range inputs with Radix Switch/Select/Slider for WAI-ARIA correctness (axe-core in repo will flag the current custom switch), keyboard support, and RTL (needed for the ar-SA locale option). | https://github.com/radix-ui/primitives |
| `better-auth` | auth | 28.6k | Very active; v1.6.x (already in package.json) | MIT | yes | — | Already wired (auth.ts, drizzle adapter, electron plugin). Keep, but harden for offline Electron: set trustedOrigins for the custom protocol, generate+persist BETTER_AUTH_SECRET locally, and surface an Account settings tab using useSession/changePassword/signOut. | https://github.com/better-auth/better-auth |
| `@better-auth/electron` | auth | (part of better-auth org) | Active; v1.6.x (already installed) | MIT | yes | — | Already installed. Required to make better-auth session cookies work across the Electron custom protocol boundary offline; ensure it's actually registered in the auth plugins list and in preload (electron/auth-client.ts). | https://www.npmjs.com/package/@better-auth/electron |
| `sonner` | feedback | 10k | Very active; v2 (already in package.json) | MIT | yes | fake saved-state button | Already a dependency. Use for non-blocking 'Settings saved'/'Import failed' toasts instead of the misleading fake-Save-button state, and as the offline notification sink the notifications.* toggles should actually gate. | https://github.com/emilkowalski/sonner |
| `zustand` | state | 54k | Very active; v5.0.10+ (Jan 2026 persist fix) | MIT | yes | — | Already the store layer. Add persist version + migrate + partialize to the settings store so the evolving shape (data/performance/notifications nesting) is safe across app upgrades, and pull selector slices to kill whole-store re-renders. Ensure v5.0.10+ for the persist rehydrate-merge fix. | https://github.com/pmndrs/zustand |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `axe-core / vitest-axe / @axe-core/playwright` | library | yes | Already in the repo (Tech Radar Domain 10). The hand-rolled Toggle (bare <button role=switch>) and custom select need a11y verification; gate the settings route in the a11y test-runner to catch missing labels/roles offline. | https://github.com/dequelabs/axe-core |
| `react-scan` | library | yes | Install as dep (not CDN) to visually confirm the per-keystroke whole-screen re-render storm before/after introducing selector slices + uncontrolled form inputs. | https://github.com/aidenybai/react-scan |
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Already in repo; add a per-route budget for /dashboard/settings so adding a form lib + Radix primitives doesn't silently bloat the route bundle. | https://github.com/ai/size-limit |
| `drizzle-kit` | cli | yes | Already the migration tool for the app_setting/auth tables; use to add any new columns (e.g. settings schema version) and to inspect the local SQLite settings rows offline via drizzle studio. | https://github.com/drizzle-team/drizzle-orm |
| `better-auth CLI (npx @better-auth/cli generate)` | cli | yes | Regenerate the auth drizzle schema locally and generate a strong BETTER_AUTH_SECRET to replace the hardcoded dev fallback for the offline build. | https://better-auth.com/docs/installation |

---

# Settings Feature — Deep Improvement Plan

`data-navigator` settings: app configuration (appearance, data, performance, notifications, shortcuts, about) backed by a Zustand store with a drizzle/better-sqlite3 durable layer, plus better-auth for single-user offline accounts. This plan covers what exists, where it bleeds performance, where it silently assumes/leaks behavior that breaks the offline contract, and a concrete, code-heavy path to a settings feature that is fast, accessible, validated, and genuinely wired to the app it claims to configure.

---

## 1. Current implementation

### 1.1 File map

| Concern | File | Notes |
|---|---|---|
| Route entry | `src/app/dashboard/settings/page.tsx` | 5 lines, renders `<SettingsScreen/>`. |
| UI | `src/features/settings/screens/SettingsScreen.tsx` | 738 lines, the entire feature UI in one client component. |
| Storybook | `src/features/settings/screens/SettingsScreen.stories.tsx` | 48 lines. |
| Store | `src/core/stores/settings-store.ts` | Zustand `persist` store; legacy + appearance + data + performance + notifications + pinnedItems. |
| Durable storage adapter | `src/platform/storage/drizzle-storage.ts` | `StateStorage` with localStorage write-through + drizzle fan-out. |
| Settings HTTP client | `src/platform/settings/settings-client.ts` | `get/put/delete/exportAppSettingRemote` over `/api/settings`. |
| Settings API route | `src/app/api/settings/[namespace]/[key]/route.ts` + `export/route.ts` | Node runtime, talks to node store. |
| Node settings store | `src/platform/settings/app-settings-store.ts` | drizzle upsert into `app_setting`. |
| Schema | `src/db/schema.ts` (`appSetting`, line 75) | composite PK `(namespace,key)`, json value. |
| Theme | `src/components/theme-provider.tsx` | **Separate** theme system using `localStorage['theme']`. |
| Auth (server) | `src/platform/auth/auth.ts` | better-auth + drizzle adapter, sqlite. |
| Auth (client) | `src/platform/auth/auth-client.ts` | `createAuthClient()` → `signIn/signOut/signUp/useSession`. |
| Auth (electron) | `electron/auth-client.ts`, `electron/preload.ts` | electron auth bridge. |
| Auth UI | `src/app/login/page.tsx`, `src/app/signup/page.tsx` | `SignInForm` exists; **not surfaced in settings**. |

### 1.2 What the store holds

`settings-store.ts` keeps three nested objects — `data` (`DataSettings`), `performance` (`PerformanceSettings`), `notifications` (`NotificationSettings`) — plus flat appearance fields (`accentColor`, `density`, `sidebarStyle`, `animationsEnabled`, `sidebarPinned`, `showBreadcrumbs`, `compactNumbers`), legacy (`maxFileSize`, `maxFiles`, `defaultFolderId`, `theme`), and `pinnedItems`. Persistence is via:

```ts
persist(creator, {
  name: "data-navigator-settings",
  storage: createJSONStorage(() => createDrizzleStorage({ namespace: "settings" })),
})
```

The drizzle storage adapter is genuinely good: synchronous localStorage working copy for instant warm hydration, one-time durable mirror into SQLite, cold-path restore from SQLite when localStorage is wiped. This is the **strongest** part of the feature and should be preserved.

### 1.3 What the UI does

`SettingsScreen.tsx` is a single 738-line client component:
- `const store = useSettingsStore();` — **whole-store subscription, no selector**.
- Local `activeTab` (6 tabs) + `saved` boolean for a fake save animation.
- All six tab panels are inline JSX guarded by `activeTab === "..."`.
- Hand-rolled `Toggle` (a bare `<button role="switch">`), `SettingSelect` (native `<select>`), `SettingRow`, `Section`.
- Each control calls a store setter directly in `onChange` (e.g. `store.setPerformance({ duckdbWorkers: Number(e.target.value) })`).
- `motion.div` keyed on `activeTab` inside `AnimatePresence mode="wait"`.

### 1.4 Who actually consumes settings

Only two consumers outside the screen, all in `sidebar-nav.tsx`:
- `pinnedItems` (line 570)
- `showBreadcrumbs` (line 1212)
- `sidebarPinned` (line 1532)

**Everything else** — `accentColor`, `density`, `compactNumbers`, `animationsEnabled`, all of `data.*`, all of `performance.*`, all of `notifications.*` — is **write-only**. The settings screen lets users tweak ~20 controls that have **zero effect** on the running app. `theme` is read by nobody in the store sense; the visible theme is driven by `theme-provider.tsx` through a *different* key (`localStorage['theme']`).

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Whole-store subscription → full-tree re-render on every change

`useSettingsStore()` with no selector means React re-runs the entire 738-line component on every `set(...)`. Toggling one switch re-renders all six tab panels' JSX (even hidden ones are recomputed before the `&&` short-circuits) and re-creates the `motion.div`.

**Fix — selector slices + `useShallow`:**

```tsx
import { useShallow } from "zustand/shallow";

// Only the appearance panel subscribes to appearance fields:
function AppearancePanel() {
  const { theme, accentColor, density, animationsEnabled,
          showBreadcrumbs, sidebarPinned, compactNumbers } =
    useSettingsStore(useShallow((s) => ({
      theme: s.theme, accentColor: s.accentColor, density: s.density,
      animationsEnabled: s.animationsEnabled, showBreadcrumbs: s.showBreadcrumbs,
      sidebarPinned: s.sidebarPinned, compactNumbers: s.compactNumbers,
    })));
  // setters are stable — pull them once, outside the selector
  const setTheme = useSettingsStore((s) => s.setTheme);
  // ...
}
```

Split the monolith into `AppearancePanel`, `DataPanel`, `PerformancePanel`, `NotificationsPanel`, `ShortcutsPanel`, `AboutPanel`, each lazy-rendered for the active tab. Now a toggle in Data re-renders only `DataPanel`.

### 2.2 Per-keystroke / per-drag write storm to SQLite

Each `onChange` immediately calls a store setter, which (through `persist` → `createDrizzleStorage.setItem`) writes localStorage **and** fires a `/api/settings` PUT → drizzle `INSERT ... ON CONFLICT` better-sqlite3 transaction. Dragging the `duckdbWorkers` slider from 1→8 fires up to 8 HTTP round-trips + 8 SQLite upserts; typing `100000` into the row-limit field fires one per digit.

**Fix A — local UI state + commit on blur/end:** keep the input controlled by local state, push to the store on `onBlur` / slider `onValueCommit`:

```tsx
function NumberSetting({ value, onCommit, min, max }: {...}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = SettingsSchema.shape.data.shape.defaultRowLimit
          .safeParse(Number(draft));
        if (parsed.success) onCommit(parsed.data);
        else setDraft(String(value)); // revert invalid
      }}
    />
  );
}
```

**Fix B — debounce the durable fan-out in the storage adapter.** Keep localStorage synchronous (warm hydration must stay instant) but coalesce the remote PUT:

```ts
// drizzle-storage.ts — debounce the durable write only
const pending = new Map<string, ReturnType<typeof setTimeout>>();
setItem(name, value) {
  writeLocal(name, value);                 // sync, immediate
  durablySynced.add(`${namespace}:${name}`);
  const k = `${namespace}:${name}`;
  clearTimeout(pending.get(k));
  pending.set(k, setTimeout(() => {
    pending.delete(k);
    void putAppSettingRemote(namespace, name, value).catch((e) => onError("set", name, e));
  }, 400));
}
```

This is a one-file change that benefits **every** persisted store, not just settings.

### 2.3 Animations ignore their own setting and `prefers-reduced-motion`

`motion.div` always animates; `store.animationsEnabled` is never read here. On a medium-end PC, re-animating a full panel on every tab switch is wasted main-thread work.

**Fix:**

```tsx
const animations = useSettingsStore((s) => s.animationsEnabled);
const reduced = useReducedMotion(); // from motion/react
const animate = animations && !reduced;
<motion.div
  initial={animate ? { opacity: 0, y: 8 } : false}
  animate={animate ? { opacity: 1, y: 0 } : { opacity: 1 }}
  transition={{ duration: animate ? 0.15 : 0 }}
/>
```

### 2.4 The fake Save button

`handleSave` only flips `saved` for 2s. Persistence is already automatic. This adds a render and lies to the user. Replace with a `sonner` toast on real commits (and remove the button, or repurpose it for explicit export/backup).

---

## 3. Offline gaps & how to close them

### 3.1 better-auth + custom protocol (the real risk)

`auth.ts` hardcodes `baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000"`. In a packaged offline Electron build that serves the renderer over a custom protocol (e.g. `app://`) or `file://`, better-auth's Origin/baseURL validation is known to reject requests (better-auth issues #7149, #7793). Sign-in then fails offline.

**Fix:** register `@better-auth/electron` (already installed) in the plugin list and declare `trustedOrigins`:

```ts
import { electron } from "@better-auth/electron";

export const authConfig = {
  appName: "DataNavigator",
  database: drizzleAdapter(authDb, { provider: "sqlite", schema }),
  secret: getOrCreateLocalSecret(),          // see 3.2
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: ["app://*", "file://*", "http://localhost:3000"],
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  plugins: [nextCookies(), electron()],
};
```

### 3.2 The hardcoded secret

`secret: process.env.BETTER_AUTH_SECRET ?? "data-navigator-local-dev-secret-change-me"`. Shipping a constant secret means sessions are forgeable and identical across installs. For single-user offline, generate once and persist in Electron `userData`:

```ts
// electron/secret.ts (main process)
import { app } from "electron";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
export function getOrCreateLocalSecret(): string {
  const f = join(app.getPath("userData"), ".auth-secret");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  const s = randomBytes(48).toString("base64url");
  writeFileSync(f, s, { mode: 0o600 });
  return s;
}
```

Web-build fallback: derive once into `app_setting` (`namespace:"auth"`, `key:"secret"`).

### 3.3 No Account tab

better-auth is fully wired but invisible in settings. Add an **Account** tab using the existing client:

```tsx
import { useSession, signOut, authClient } from "@/platform/auth/auth-client";

function AccountPanel() {
  const { data: session, isPending } = useSession();
  if (isPending) return <Spinner />;
  if (!session) return <SignedOutCallout />;
  return (
    <Section title="Account" icon={User}>
      <SettingRow label="Signed in as">{session.user.email}</SettingRow>
      <ChangePasswordForm />   {/* authClient.changePassword */}
      <button onClick={() => signOut()}>Sign out</button>
    </Section>
  );
}
```

`ChangePasswordForm` is the first real use case for a validated form (section 5).

### 3.4 Export / import (offline backup) has no UI

`exportAppSettingsRemote` exists but is unused. Add explicit **Backup / Restore** so a profile wipe is recoverable purely offline:

```tsx
async function handleExport() {
  const all = await exportAppSettingsRemote();          // { settings: { settings: {...} } }
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), {
    href: url, download: `data-navigator-settings-${Date.now()}.json`,
  }).click();
  URL.revokeObjectURL(url);
}

async function handleImport(file: File) {
  const json = JSON.parse(await file.text());
  const parsed = ExportSchema.safeParse(json);          // zod — never trust the file
  if (!parsed.success) { toast.error("Invalid settings file"); return; }
  for (const [key, value] of Object.entries(parsed.data.settings.settings))
    await putAppSettingRemote("settings", key, value);
  useSettingsStore.persist.rehydrate();                  // pull restored values
  toast.success("Settings restored");
}
```

### 3.5 About tab lies offline

Hardcoded `"DuckDB WASM 1.33.1"`, `"Framer Motion 11"`, `"v2.0.0"` will drift. Generate `src/generated/build-info.json` at build time from `package.json` + git SHA and read it:

```ts
// scripts/gen-build-info.ts (build step, offline)
import pkg from "../package.json" assert { type: "json" };
import { execSync } from "node:child_process";
const info = {
  version: pkg.version,
  duckdb: pkg.dependencies["@duckdb/node-api"] ?? pkg.dependencies["@duckdb/duckdb-wasm"],
  echarts: pkg.dependencies.echarts,
  commit: execSync("git rev-parse --short HEAD").toString().trim(),
  builtAt: new Date().toISOString(),
};
```

### 3.6 No storage / quota surface

Per Tech Radar Domain 1, call `navigator.storage.persist()` at startup and surface `estimate()`:

```tsx
function StoragePanel() {
  const [q, setQ] = useState<{usage:number;quota:number}>();
  useEffect(() => { navigator.storage?.estimate().then((e) =>
    setQ({ usage: e.usage ?? 0, quota: e.quota ?? 0 })); }, []);
  return (
    <Section title="Storage" icon={HardDrive}>
      <SettingRow label="Used">{fmtBytes(q?.usage)} / {fmtBytes(q?.quota)}</SettingRow>
      <Progress value={q ? (q.usage / q.quota) * 100 : 0} />
    </Section>
  );
}
```

### 3.7 No model-management surface

The app caches HF/sherpa/Piper/Kokoro models to IndexedDB/OPFS. Settings is the natural home for "which models are cached, how big, clear cache." List cache entries (Cache Storage / OPFS directory) with per-model size + a clear button. This makes the offline model story user-controllable.

---

## 4. Better architecture & implementation (step-by-step)

### 4.1 One schema to rule the store (zod, already a dep)

Define a single source of truth that both validates input and clamps ranges:

```ts
// src/features/settings/lib/settings-schema.ts
import { z } from "zod";

export const AccentColor = z.enum(["indigo","violet","cyan","emerald","amber","rose"]);
export const DensityMode = z.enum(["compact","comfortable","spacious"]);

export const DataSettings = z.object({
  autoRefreshInterval: z.coerce.number().int().min(0).max(3600).default(0),
  defaultRowLimit: z.coerce.number().int().min(100).max(1_000_000).default(10_000),
  defaultDateFormat: z.string().default("MMM d, yyyy"),
  numberLocale: z.string().default("en-US"),
  decimalSeparator: z.enum([".",","]).default("."),
  nullDisplay: z.string().max(8).default("—"),
  enableQueryHistory: z.boolean().default(true),
});

export const PerformanceSettings = z.object({
  duckdbWorkers: z.coerce.number().int().min(1).max(8).default(4),
  enableWASMStreaming: z.boolean().default(true),
  maxMemoryMB: z.coerce.number().int().min(256).max(4096).default(512),
  cacheQueries: z.boolean().default(true),
  virtualizeThreshold: z.coerce.number().int().min(50).max(5000).default(500),
});

export const SettingsSchema = z.object({
  theme: z.enum(["light","dark","system"]).default("dark"),
  accentColor: AccentColor.default("indigo"),
  density: DensityMode.default("comfortable"),
  // ...rest...
  data: DataSettings,
  performance: PerformanceSettings,
});
export type Settings = z.infer<typeof SettingsSchema>;
```

Every numeric setter validates through the matching field; the store can no longer hold `NaN` or out-of-range values.

### 4.2 Versioned, partialized persist (safe upgrades)

```ts
persist(creator, {
  name: "data-navigator-settings",
  version: 2,
  storage: createJSONStorage(() => createDrizzleStorage({ namespace: "settings" })),
  partialize: (s) => ({                 // only durable fields; never persist actions
    theme: s.theme, accentColor: s.accentColor, density: s.density,
    animationsEnabled: s.animationsEnabled, sidebarPinned: s.sidebarPinned,
    showBreadcrumbs: s.showBreadcrumbs, compactNumbers: s.compactNumbers,
    data: s.data, performance: s.performance, notifications: s.notifications,
    pinnedItems: s.pinnedItems,
    maxFileSize: s.maxFileSize, maxFiles: s.maxFiles, defaultFolderId: s.defaultFolderId,
  }),
  migrate: (persisted, version) => {
    // re-parse through SettingsSchema so old/partial shapes get defaults + clamping
    const safe = SettingsSchema.partial().safeParse(persisted);
    return safe.success ? { ...persisted, ...safe.data } : persisted;
  },
});
```

Requires zustand ≥ 5.0.10 (Jan 2026 persist rehydrate-merge fix). Confirm/bump.

### 4.3 The missing piece: a settings *effects* applier

Create one provider that turns persisted settings into actual app behavior — this is what makes the Performance/Appearance tabs real.

```tsx
// src/features/settings/components/settings-effects.tsx
"use client";
export function SettingsEffects() {
  const { accentColor, density, compactNumbers, theme } =
    useSettingsStore(useShallow((s) => ({
      accentColor: s.accentColor, density: s.density,
      compactNumbers: s.compactNumbers, theme: s.theme,
    })));
  const { setTheme } = useTheme();   // bridge to theme-provider

  // 1. unify theme: settings store -> theme provider (single source)
  useEffect(() => { setTheme(theme); }, [theme, setTheme]);

  // 2. inject CSS vars / data-attrs for accent + density
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density;        // CSS: [data-density="compact"] { --dn-space: ... }
    root.dataset.accent = accentColor;     // CSS maps to --dn-accent
  }, [accentColor, density]);

  return null;
}
```

And in `globals.css`:

```css
[data-accent="violet"] { --dn-accent: var(--violet-9); }
[data-accent="cyan"]   { --dn-accent: var(--cyan-9); }
[data-density="compact"]    { --dn-space: 0.5rem; }
[data-density="spacious"]   { --dn-space: 1.25rem; }
```

Mount `<SettingsEffects/>` once in `src/app/dashboard/layout.tsx`. Now changing accent/density/theme visibly changes the app.

**Theme unification:** the cleanest end state is to delete `theme-provider`'s own `localStorage['theme']` source of truth and make the settings store the single owner; the provider becomes a pure applier that takes `resolvedTheme` derived from the store. Minimum viable fix is the bridge above.

### 4.4 Wire performance settings to consumers

- `duckdbWorkers` / `maxMemoryMB` → read in the DuckDB worker-pool bootstrap (a "requires reload" banner is honest here, since the pool is created once). On the native Electron path (`@duckdb/node-api`, Tech Radar Domain 2) translate `maxMemoryMB` to a `SET memory_limit='512MB'` PRAGMA and `duckdbWorkers` to `SET threads=N`.
- `virtualizeThreshold` → read by the TanStack Virtual table wrapper to decide DOM vs virtualized rendering.
- `cacheQueries` → gate the query-result cache key.
- `enableWASMStreaming` → branch the DuckDB-WASM instantiation path (web build only).

Add a `useSettingsSelector` helper so consumers subscribe to single fields without re-rendering on unrelated changes:

```ts
export const usePerf = <T,>(sel: (p: PerformanceSettings) => T) =>
  useSettingsStore((s) => sel(s.performance));
// const threads = usePerf((p) => p.duckdbWorkers);
```

### 4.5 Accessible controls via Radix (already installed)

Replace the bare `<button role="switch">`, native `<select>`, and `<input type=range>` with Radix Switch/Select/Slider. axe-core (in repo) will otherwise flag the custom switch (no label association) and native select styling traps. Example Switch wrapper:

```tsx
import { Switch } from "radix-ui";
function Toggle({ checked, onChange, label, description, id }: {...}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id}>
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </label>
      <Switch.Root id={id} checked={checked} onCheckedChange={onChange}
        className="w-10 h-6 rounded-full bg-accent data-[state=checked]:bg-primary">
        <Switch.Thumb className="block w-4 h-4 rounded-full bg-white translate-x-1 data-[state=checked]:translate-x-5 transition-transform" />
      </Switch.Root>
    </div>
  );
}
```

Slider uses `onValueCommit` (not `onValueChange`) to write to the store — solving the write storm at the control level. The `ar-SA` locale option also gains correct RTL via Radix Slider's `dir` support.

### 4.6 Component decomposition

```
src/features/settings/
  screens/SettingsScreen.tsx        // shell: tabs + lazy panel mount only
  components/
    settings-effects.tsx            // NEW: applier (theme/accent/density)
    panels/
      appearance-panel.tsx
      data-panel.tsx
      performance-panel.tsx
      notifications-panel.tsx
      account-panel.tsx             // NEW: better-auth
      storage-panel.tsx             // NEW: quota + model cache
      shortcuts-panel.tsx
      about-panel.tsx               // reads build-info.json
    controls/{toggle,select,slider,number-field}.tsx  // Radix-based, reusable
  lib/
    settings-schema.ts              // zod
    settings-backup.ts              // export/import
```

Each panel is dynamically imported so the settings route bundle stays lean (size-limit budget per 4.8).

---

## 5. Forms: validated Account + numeric settings

The only genuine forms here are **change password** and **sign-in/up** (already partly built). Use a headless form lib with the Zod schema. Two viable picks (choose ONE):

- **@tanstack/react-form** (5k★, MIT, very active) — first-class Zod adapter, best-in-class TS inference, matches the project's TanStack stack.
- **react-hook-form** (43k★, MIT) — de-facto standard, uncontrolled inputs minimize re-renders, `zodResolver` via `@hookform/resolvers`.

TanStack Form example for change-password:

```tsx
import { useForm } from "@tanstack/react-form";
const ChangePassword = z.object({
  current: z.string().min(8),
  next: z.string().min(8),
  confirm: z.string(),
}).refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function ChangePasswordForm() {
  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onSubmit: ChangePassword },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.changePassword({
        currentPassword: value.current, newPassword: value.next,
      });
      if (error) toast.error(error.message); else toast.success("Password updated");
    },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field name="current">{(f) => (
        <Input type="password" value={f.state.value}
          onBlur={f.handleBlur} onChange={(e) => f.handleChange(e.target.value)} />
      )}</form.Field>
      {/* next, confirm ... */}
    </form>
  );
}
```

For the numeric settings, full form machinery is overkill — the `NumberSetting` controlled-draft + zod-on-blur pattern (2.2) is sufficient and lighter.

---

## 6. Recommended dependencies

| Dep | Stars | Maint. | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| zod (have ^4.4.3) | 39k | Very active v4 | MIT | yes | Single SettingsSchema: coerce/clamp numerics, validate imported JSON. | https://github.com/colinhacks/zod |
| @tanstack/react-form **or** react-hook-form | 5k / 43k | Very active | MIT | yes | Validated Account/password forms; pick one. | https://github.com/TanStack/form |
| radix-ui (have ^1.5.0) | 16k | Very active | MIT | yes | WAI-ARIA Switch/Select/Slider; RTL; fixes axe failures + write storm via onValueCommit. | https://github.com/radix-ui/primitives |
| better-auth (have ^1.6.14) | 28.6k | Very active | MIT | yes | Keep; harden trustedOrigins + local secret; surface Account tab. | https://github.com/better-auth/better-auth |
| @better-auth/electron (have) | — | Active | MIT | yes | Make sessions work across custom protocol offline. | https://www.npmjs.com/package/@better-auth/electron |
| sonner (have ^2.0.7) | 10k | Very active | MIT | yes | Real save/backup/notification toasts; replaces fake Save state. | https://github.com/emilkowalski/sonner |
| zustand (have v5) | 54k | Very active | MIT | yes | persist version/migrate/partialize + selector slices; ensure ≥5.0.10. | https://github.com/pmndrs/zustand |

Notable: **no new runtime dependency is strictly required** — everything except the form lib is already installed. The only net-new dep is the form library (and even that is optional if the team hand-rolls the two small auth forms with the existing zod + controlled inputs).

---

## 7. CLIs & tools (all offline)

- **axe-core / vitest-axe / @axe-core/playwright** (in repo) — gate `/dashboard/settings` for a11y; the current custom Toggle/select will fail and must be Radix-ized.
- **react-scan** — visually confirm the per-keystroke whole-screen re-render before/after selector slices.
- **size-limit** (`@size-limit/preset-app` + time) — add a per-route budget for the settings chunk so adding Radix + a form lib doesn't bloat it.
- **drizzle-kit** — add a `settings schema version` if needed; inspect `app_setting` rows offline via drizzle studio.
- **better-auth CLI** (`npx @better-auth/cli generate`) — regenerate auth schema; generate a strong secret to replace the dev fallback.
- **knip** (in repo) — after decomposition, catch the orphaned `Save` handler and any now-dead setters.

---

## 8. Phased tasks

### P1 — correctness + offline integrity (highest value, low risk)
1. **Unify theme**: bridge settings-store `theme` → theme-provider (or make store the single source). The settings theme toggle currently does nothing.
2. **Settings effects applier**: inject `data-accent` / `data-density` + CSS vars; mount in dashboard layout. Makes Appearance real.
3. **zod SettingsSchema** + clamp all numeric setters; validate on blur; never persist NaN/out-of-range.
4. **persist version+migrate+partialize**; bump zustand to ≥5.0.10.
5. **better-auth offline hardening**: register `@better-auth/electron`, add `trustedOrigins`, generate+persist local secret.
6. Replace fake Save button with `sonner` toasts.

### P2 — performance + accessibility
7. Decompose `SettingsScreen` into lazy per-tab panels; selector slices + `useShallow`.
8. Debounce the durable write in `drizzle-storage.setItem` (benefits all stores).
9. Replace Toggle/Select/range with Radix Switch/Select/Slider (`onValueCommit`); pass axe.
10. Respect `animationsEnabled` + `prefers-reduced-motion` in panel transitions.
11. **Wire performance settings to consumers**: `duckdbWorkers`/`maxMemoryMB`→DuckDB pool/PRAGMA, `virtualizeThreshold`→TanStack Virtual, `cacheQueries`→query cache.

### P3 — new offline surfaces
12. **Account tab** (better-auth: session, change-password via TanStack Form/RHF, sign-out).
13. **Backup/Restore** export+import JSON with zod validation on import.
14. **Storage tab**: `navigator.storage.persist()`/`estimate()` + model-cache listing with clear.
15. **About tab** reads generated `build-info.json` instead of hardcoded strings.
16. Wire `notifications.*` toggles to actually gate sonner toasts (currently decorative).

---

## 9. Risk notes

- Theme unification touches two systems; ship behind a quick visual check (dark/light/system + accent) since it affects every page.
- DuckDB worker-count changes legitimately require a reload — surface an honest "Apply on reload" banner rather than pretending it's live.
- Debouncing durable writes slightly widens the window where a hard crash loses the last <400ms of edits; acceptable for settings, and localStorage already holds the value synchronously.
- Bumping zustand: verify the persist rehydrate behavior across the other ~8 stores that use `createDrizzleStorage` (data-store, chart-store, file-store, etc.) — they share the adapter.