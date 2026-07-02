# Data Navigator — Technology & System-Design Decisions Audit

13 clusters, 80 individual technology decisions researched against current (2025-2026) web best practice and this app's specific offline/Electron/single-process constraints.

---

## Client state management

_Packages: zustand, @tanstack/db, xstate, immer, @xstate/react_

**Cluster sanity-check:** The zustand and @tanstack/db verdicts hold up well against the repo's own evidence: zustand is used correctly and extensively (30+ stores) with no multi-team-coordination need that would justify Redux Toolkit, and @tanstack/db has zero imports anywhere in src/ while the project's own tech-radar.md/dependency-catalog.md independently classify it as "HOLD — beta + sync-oriented, keep scoped/off critical path" — strong independent corroboration for "reconsider." The immer verdict is also well grounded: import-session-store.ts contains an explicit code comment documenting a past perf regression from exactly the ad-hoc produce()-per-tick pattern now present in DataBrowserScreen.tsx, and docs/planning/v2/features/data-transform.md independently documents the same anti-pattern in DataTransformScreen.tsx (3-5 produce() calls per pipeline step causing jank) — the researcher may even be under-scoping this finding to one file. The xstate verdict, however, overstates its case: xstate/@xstate/react have zero imports anywhere in src/ (identical to @tanstack/db's situation), and — unlike every other installed dependency including @tanstack/db and immer — xstate is entirely absent from the project's own master dependency-audit tables (tech-radar.md, dependency-catalog.md), suggesting the project's own auditors didn't consider it a going-forward-relevant pick. The "textbook use case" the researcher cites (LAN-hub host election/failover) is a single suggestion line in one speculative tech-radar spike brief, not a scheduled feature — it appears in neither docs/planning/v2/roadmap.md nor the actual collab-lan.md implementation brief. Git history shows xstate was bulk-added in a large "add comprehensive user journey tests" commit alongside many other speculative/unused deps (@tensorflow/tfjs, @langchain/core, @huggingface/transformers), not deliberately introduced for this use case — the brief just noticed it was "already a dep" and opportunistically suggested a use. Given zero current usage, absence from the project's own dependency audit, and a citation to an unscheduled spike-brief bullet, xstate is currently in the same dead-weight category as @tanstack/db, not a confirmed "right tool, just underused" case.

### Zustand for renderer state — Well-justified

**Current choice:** zustand ^5.0.14 as the sole client-state library across the renderer

**Usage evidence:** Confirmed via repo check: 33 files import from 'zustand' across src/core/stores/*.ts (activity, app-context, app-session, data, folders, report-draft, settings) and 20+ feature stores (agent-canvas, ai-briefing, channel-monitor, collaboration, csv-parser, dashboard-home, dashboard-shell, data-formulator (x2), data-import, deep-analytics, desktop, eye-tracking, reconciliation, telecom, ux-innovations, platform/ai/provider). The repo's own 2026-07-01 architecture audit (docs/superpowers/specs/2026-07-01-architecture-audit.md) independently counts '~20-store Zustand setup' and audits all 18 stores using persist(). 31 files use zustand's persist() middleware, most via a custom createDrizzleStorage adapter (src/platform/storage/drizzle-storage.ts, localStorage-warm + SQLite-durable) rather than plain localStorage. A dedicated discipline layer exists at src/platform/storage/create-selectors.ts (createSelectors + re-exported useShallow) specifically to fix a documented perf defect (bare useStore() causing whole-tree re-renders across dashboard-shell, channel-monitor, collab-hub, agent-canvas, ux-innovations). 50 call sites use store.getState()/store.subscribe() directly outside React components (services/utils/non-component modules), which only works because Zustand stores are plain modules, not context-bound.

**Alternatives:** Redux Toolkit: still the 2025-2026 pick for large teams needing strict action/reducer patterns, time-travel DevTools, and enforced middleware pipelines, but ships heavier (RTK + react-redux + built-in Immer/reselect vs. Zustand's ~1.1kB core) and requires provider wrapping. Jotai: atom-first, composable, automatic fine-grained re-render tracking without manual selectors — favored in 2025-2026 write-ups (makersden.io, dev.to) when state is naturally atomic/derived. Valtio: proxy-based mutable model with automatic render-optimization via property-access tracking, no selector discipline needed, but requires immutable->mutable mental-model switch. Plain React Context: zero-dependency but requires provider trees and cannot be read/written from non-component code without extra plumbing (refs/singletons) — a real gap given 50 getState()/subscribe() call sites in this codebase that live outside components.

**Reasoning:** For a single-user, offline-first Electron renderer on medium-end hardware, Redux Toolkit's main selling points (strict team conventions, time-travel debugging, a large ecosystem for coordinating many contributors) don't pay for their bundle/boilerplate cost here — there's no multi-team coordination problem, and RTK's built-in Immer+reselect+thunk stack duplicates functionality this repo already gets a la carte (immer is already a direct dependency where actually needed). Jotai's atomic model would be a better fit only if the codebase's actual re-render problem were 'state is over-centralized into one big atom' — but the audit's own diagnosis is the opposite: bare, un-narrowed useStore() calls and multiple independently-persisted stores owning overlapping session state (three stores all separately holding tableName/fileName/reportDate). That is a selector-discipline and store-design problem, not a library problem, and Jotai wouldn't fix it for free — the codebase would need the same 'narrow subscriptions everywhere' discipline it's now enforcing via createSelectors()/useShallow on top of Zustand. Valtio's automatic mutable tracking is genuinely interesting for this app (would eliminate the need for the createSelectors helper and produce()-heavy patterns in DataBrowserScreen.tsx) but migrating 20+ already-persisted stores for a marginal DX win, with no correctness or performance problem Zustand can't already solve via selectors, isn't worth the churn on a codebase this large. Context is disqualified outright by the 50 non-component getState()/subscribe() call sites — Zustand's plain-module store (readable from any file, no provider) is a concrete practical fit for an app whose logic straddles React components, plain utility/service modules, and IPC-adjacent code in the renderer. Net: Zustand is the right choice; the documented problems (persist() version/migrate gaps in 9/18 stores, tri-store session-state duplication, unselectored subscriptions) are usage-discipline bugs to fix in place, not evidence the library itself is wrong.

**Sources:**
  - [Zustand official docs — Comparison (Redux, Valtio, Jotai/Recoil)](https://zustand.docs.pmnd.rs/learn/getting-started/comparison)
  - [Zustand official docs — Slices Pattern](https://zustand.docs.pmnd.rs/learn/guides/slices-pattern)
  - [State Management in 2026: Zustand vs Jotai vs Redux Toolkit vs Signals](https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge)
  - [Zustand vs Jotai vs Valtio: Performance Guide 2025](https://www.reactlibraries.com/blog/zustand-vs-jotai-vs-valtio-performance-guide-2025)
  - [Zustand vs. Redux Toolkit vs. Jotai — Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/zustand-vs-redux-toolkit-vs-jotai/)
  - [pmndrs/zustand Discussion #2486 — one global store vs separate stores](https://github.com/pmndrs/zustand/discussions/2486)

### @tanstack/db for reactive local collections/live queries — Reconsider

**Current choice:** @tanstack/db ^0.6.8, installed as a dependency

**Usage evidence:** Confirmed via repo check: zero imports anywhere in src/ (`from "@tanstack/db"` search returns no matches). The only references in the entire repository are package.json, pnpm-lock.yaml, and this project's own planning docs (docs/planning/v2/dependency-catalog.md, tech-radar.md), which already flag it themselves: 'Installed but BETA + sync-oriented. Not the offline source of truth; keep scoped/off the critical path' and list it under 'HOLD — do not adopt as primary.' No feature (including collaboration, the one area it's scoped to) currently reads or writes through it.

**Alternatives:** TanStack DB's actual value proposition (per its docs/blog) is sub-millisecond incremental live queries over synced collections, implemented via d2ts differential dataflow, with built-in collection types (ElectricCollection, PowerSyncCollection, RxDBCollection, QueryCollection) — i.e. it's designed to sit on top of a sync engine (Electric, PowerSync) or TanStack Query/REST polling, turning API data into reactively-queryable local collections. Zustand + DuckDB (already in this app) already cover 'reactive local state' and 'fast local queries' respectively for the offline case. Dexie (already used, ~13+ tables) covers durable IndexedDB persistence. Tinybase is called out in this repo's own tech-radar.md as a lighter, non-beta 'alternative to @tanstack/db' if a reactive local store with pluggable IndexedDB/OPFS persistence is ever actually needed.

**Reasoning:** This package earns zero benefit for the app today — it's dead weight in the dependency graph (audit/update surface, beta-version churn risk, lockfile noise) with no compensating runtime value, since nothing imports it. Its design center (sync-engine-fed reactive collections with incremental live queries) is aimed at exactly the kind of cloud-backed, multi-client-sync architecture this app explicitly rejects (per the repo's own dependency-catalog.md, ElectricSQL/PowerSync/Zero/Convex are already REJECTED as 'server+Postgres/Mongo sync engines; violate offline-only'). The one plausible fit — collaboration's local reactive queries over the CRDT-backed dataset — hasn't been wired up, and the repo's own docs already recommend Tinybase as the lighter, more mature alternative if that need materializes. Given it's still beta and 100% unused, the honest move is either remove it now and re-add if collaboration's local-query needs become concrete, or timebox an actual PoC against the collaboration feature; keeping an unused beta dependency installed indefinitely is not a defensible middle state.

**Sources:**
  - [TanStack DB — Overview](https://tanstack.com/db/latest/docs)
  - [TanStack DB — Live Queries](https://tanstack.com/db/latest/docs/guides/live-queries)
  - [TanStack DB 0.6 — Persistence, Offline Support, Hierarchical Data](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)
  - [TanStack DB 0.5 — Query-Driven Sync](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync)
  - [tinybase — lighter reactive local store](https://github.com/tinyplex/tinybase)

### xstate + @xstate/react for state machines — Reconsider

**Current choice:** xstate ^5.32.0 and @xstate/react ^6.1.0, installed as dependencies

**Usage evidence:** Confirmed via repo check: zero imports anywhere in src/ (no `from "xstate"`, `from "@xstate/react"`, `createMachine`, `createActor`, `useMachine`, or `useActor` matches). The only mention of intended use is a single planning brief (docs/planning/v2/briefs/local-first-realtime-collaboration...md): 'Host election for Option A... Keep a small state machine for this (xstate is already a dep).' That host-election/failover logic does not exist yet in src/platform/collab/ (no host-election, mDNS-promote, or elect-related code found) — the dependency was added ahead of a feature that was never built.

**Alternatives:** @xstate/store (a 2024-2025 addition, mentioned directly in the search results) is a much smaller event-based store (Redux/Zustand-like API) with an explicit upgrade path to full XState machines only if/when complexity demands it — arguably a better starting point than pulling in full xstate v5 for a single small machine. Hand-rolled boolean/enum state with a switch statement is the status-quo alternative already used elsewhere in this codebase for similar lifecycle logic, but is exactly the pattern XState is meant to replace once transitions get non-trivial (host up -> disconnecting -> election -> promoting -> new-host-synced, with guards and retries).

**Reasoning:** Unlike @tanstack/db, XState isn't a poor conceptual fit here — the one concrete use case the repo's own docs identify (LAN-hub host election / failover when the hosting peer disappears, replaying y-indexeddb state into a fresh Hocuspocus hub) is a textbook XState scenario: a handful of explicit states, guarded transitions, and retry/timeout logic that's easy to get subtly wrong as hand-rolled boolean flags and hard to reason about without a diagram. Current guidance (Stately/XState v5 docs, makersden.io 2025 state-management roundup) is consistent: reach for XState when orchestrating genuinely stateful, multi-step app logic with hierarchical/parallel states, not as a blanket state-management replacement for Zustand. The problem isn't that XState was the wrong call — it's that the dependency has sat unused since being added, which is the same 'dead weight, beta/major-version churn risk with zero payback' issue as @tanstack/db until the collaboration host-election logic is actually implemented. Given the LAN collaboration feature exists (src/features/collaboration, src/platform/collab/persistence.ts) but host failover doesn't, this is the one dependency in the cluster worth keeping and finishing rather than removing — but it should be built or dropped, not left installed indefinitely as aspirational weight.

> **Verify override:** was "Right tool, underused", changed to "Reconsider" — Zero imports anywhere in src/ (confirmed via repo-wide search) — identical current state to @tanstack/db, which the researcher correctly flagged as dead weight. Unlike every other installed dependency (including @tanstack/db and immer), xstate does not appear at all in the project's own master dependency-audit documents (docs/planning/v2/tech-radar.md, docs/planning/v2/dependency-catalog.md), suggesting the project's own auditors did not consider it a going-forward pick. The cited 'textbook use case' (LAN-hub host election/failover) is a single bullet in one speculative tech-radar spike brief (docs/planning/v2/briefs/local-first-realtime-collaboration-without-a-cloud-for-data-.md) and is absent from both docs/planning/v2/roadmap.md and the actual collab-lan.md implementation brief — it is not a scheduled feature. Git blame shows xstate/@xstate/react were bulk-added in a large 'add comprehensive user journey tests' commit alongside many other speculative/unused deps (tensorflow, langchain, huggingface/transformers), not deliberately chosen for this use case — the brief merely noticed it was 'already a dep' post hoc. Given the codebase's existing all-Zustand/plain-reducer conventions, even the hypothetical host-election FSM (a handful of states) may not need a whole new state-machine library and React binding. Treat as a removal/dead-weight candidate like @tanstack/db unless and until the host-election feature is actually scheduled.

**Sources:**
  - [XState v5 is here — Stately blog](https://stately.ai/blog/2023-12-01-xstate-v5)
  - [Introducing XState Store (TkDodo)](https://tkdodo.eu/blog/introducing-x-state-store)
  - [State Management Trends in React 2025: When to Use Zustand, Jotai, XState — Makers' Den](https://makersden.io/blog/react-state-management-in-2025)
  - [statelyai/xstate — GitHub](https://github.com/statelyai/xstate)

### Immer for nested/immutable state updates — Reconsider

**Current choice:** immer ^11.1.8, used via zustand/middleware/immer in one store and via direct produce() calls in one screen component

**Usage evidence:** Confirmed via repo check: real (non-substring-false-positive) usage is exactly two files. (1) src/features/agent-canvas/core/agent-store.ts wraps its zustand create() in the official immer(set => ...) middleware for a store with genuinely deep nested state (SQL tabs array, flow nodes, human-interrupt payloads, agent phase). (2) src/features/data-browser/screens/DataBrowserScreen.tsx imports produce directly from 'immer' and calls it ~26 times inline across a 3030-line component with 50 useState hooks (confirmed by `grep -c useState` = 50), matching this repo's own architecture audit finding that this file needs to be split into cohesive hooks/a store (useDataBrowserQuery/useDataBrowserFilters/useDataBrowserSelection/useDataBrowserColumns). A third historical usage was already removed: src/features/data-import/model/import-session-store.ts's own header comment documents that it used to rebuild an entire array with produce() on every progress tick and was rewritten into a keyed-by-id Zustand store specifically to eliminate that O(N) re-render/re-clone cost — i.e. this exact anti-pattern was already identified and fixed once in this codebase.

**Alternatives:** Zustand's own immer middleware (already in use) is the standard pairing when a store's nested-update ergonomics genuinely warrant it, per Zustand's official immer-middleware docs. For component-local nested useState updates, the current React/Zustand-community guidance (Kent C. Dodds' colocation principle, this repo's own audit) is to first ask whether that much local state belongs in a component at all — DataBrowserScreen's problem is 50 useState hooks spanning 4+ unrelated concerns (query/filters/selection/columns), which no immutability helper fixes; extracting cohesive custom hooks or a scoped Zustand store (as ParsedDataScreen.tsx and import-session-store.ts already do elsewhere in this codebase) removes most of the need for ad hoc produce() calls in the first place.

**Reasoning:** Immer itself is a reasonable, lightweight (well-known, ~28k-star, structural-sharing) tool and the one middleware-level usage (agent-store.ts) is a legitimate, idiomatic case exactly matching Zustand's own documented guidance for stores with deep nesting — no change needed there. The DataBrowserScreen.tsx usage is the actual problem, but it's a symptom, not a case against immer: 26 scattered produce() calls are propping up 50 unstructured useState hooks in one 3030-line screen, which is the same 'state should be extracted into cohesive slices' issue this codebase already fixed once in import-session-store.ts (whose header comment describes almost this exact anti-pattern) and already fixed once in agent-store.ts (proper middleware usage). For this single-user, resource-constrained desktop app, immer's runtime cost (extra Proxy/structural-sharing overhead per update) is not the concern — medium-end hardware handles it fine for a few nested stores; the concern is architectural: keep immer for the one store that needs it, and treat DataBrowserScreen's produce() calls as a signal to finish the hook/store extraction the audit already recommends, not as a reason to add or remove the immer dependency itself.

**Sources:**
  - [Immer middleware — Zustand official docs](https://zustand.docs.pmnd.rs/reference/integrations/immer-middleware)
  - [Zustand Middleware: The Architectural Core of Scalable State Management](https://beyondthecode.medium.com/zustand-middleware-the-architectural-core-of-scalable-state-management-d8d1053489ac)
  - [Mastering State Management with Zustand and Immer](https://blog.dushyanth.in/mastering-state-management-with-zustand-and-immer-a-guide-to-efficient-state-updates)

---

## ORM & persistence layer

_Packages: drizzle-orm, drizzle-kit, @better-auth/drizzle-adapter, better-sqlite3, better-sqlite3-multiple-ciphers, dexie_

**Cluster sanity-check:** The researcher's framing checks out against the actual code, not just plausible-sounding assumptions. Verified directly: `electron/main.ts` uses `app.requestSingleInstanceLock()`, `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`, and `assertLoopbackHostname()` strictly forbids binding the embedded Next/better-auth server to anything but localhost — so the "single process, single connection, no LAN concurrency, renderer structurally can't touch better-sqlite3" premises behind the drizzle-orm, better-sqlite3, and Dexie verdicts are all true, not assumed. The drizzle-kit "reconsider" verdict is if anything understated: there is no npm script or CI step anywhere that invokes drizzle-kit, the generated `./drizzle/*.sql` migrations are never executed at runtime (both `auth-database.ts` and `electron/settings-store.ts` apply their own hand-written `CREATE TABLE` strings instead), and `drizzle.config.ts` only points at `src/db/schema.ts` (the auth tables) — it doesn't even cover the settings-store's separate inline schema, so drizzle-kit couldn't keep both DDLs in sync even if someone ran it. better-sqlite3-multiple-ciphers is a real, tested, opt-in (`DN_ENCRYPT_AUTH_DB`, default off) code path with its own test file, not dead weight, and its "well-justified" verdict scoped correctly to just the auth DB (it doesn't cover settings-store.ts, which stays plaintext — but that's a scope-of-encryption question, not a wrong-package one). Dexie's package-level pick is sound and heavily exercised (20+ feature modules), though project history separately notes the Dexie *implementation* is fragmented with dead tables across 10+ ad-hoc DBs — that's an app-architecture cleanup issue, not evidence the Dexie/IndexedDB package choice itself was wrong, so it doesn't undermine the verdict as scoped.

### Drizzle ORM (drizzle-orm) for Electron main-process SQLite — Well-justified

**Current choice:** drizzle-orm 0.45.2, sqlite-core dialect, used as a thin typed query builder over better-sqlite3

**Usage evidence:** Exactly 3 non-test source files import drizzle-orm: electron/settings-store.ts (app_setting KV table across settings.db/analytics.db), src/db/schema.ts (better-auth's user/session/account/verification tables), src/platform/auth/auth-database.ts (opens the auth DB handle). No `relations()`/joins are hand-written in app code — better-auth's adapter does that internally. This is a narrow, main-process-only footprint: 2 logical databases, 5 tables total, all simple CRUD/upsert.

**Alternatives:** Prisma: comprehensive DX, schema.prisma single source of truth, but ships a Rust query engine binary (~30-60MB, and reports of a packaged Electron app dropping from 523MB to ~300MB after moving off Prisma) plus repeated Electron-packaging issues getting the generated client/engine into the ASAR; Prisma's newer Rust-free engine narrows this gap (~1.6MB) but is still heavier than Drizzle's ~5KB core and adds an extra build step. Kysely: a pure SQL-shaped query builder (no schema/entity layer, no built-in migration tool) — closer to raw SQL than Drizzle, notably it's also better-auth's own *built-in* adapter. TypeORM: decorator/reflect-metadata based, slowing maintenance cadence, accepted as carrying "ecosystem risk" for new 2026 projects. Raw better-sqlite3 SQL: zero abstraction, fully viable given the small surface (5 tables), but loses compile-time column typing for the two schemas.

**Reasoning:** For a single-connection, single-process, offline SQLite store with no need for connection pooling or a network query engine, Prisma's engine-binary weight is pure packaging cost with no runtime benefit here — bundle size matters more for a downloadable desktop installer than for a hosted server. Drizzle's near-zero footprint and synchronous, direct-to-better-sqlite3 call path match the "thin main-process I/O shell" role this code plays. TypeORM's decorator model and slower cadence are an unnecessary risk for greenfield code. Kysely would have been an equally defensible minimalist choice (and is literally what better-auth defaults to), but Drizzle lets the schema (src/db/schema.ts) double as the typed contract that `drizzleAdapter` consumes, avoiding a second query-builder paradigm in the same process. Given the actual usage is thin (2 DBs, 5 tables, no complex joins), raw better-sqlite3 SQL would also have worked with less dependency weight, but Drizzle's cost here is negligible (~5KB) and the typed schema gives real value at the better-auth boundary, so it is not overkill.

**Sources:**
  - [Why shipping Prisma with our Electron app was a mistake](https://www.sabatino.dev/why-shipping-prisma-with-our-electron-app-was-a-mistake/)
  - [Prisma ORM without Rust: Latest Performance Benchmarks](https://www.prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks)
  - [Prisma doesn't work with Electron-Forge/Webpack · Issue #12627](https://github.com/prisma/prisma/issues/12627)
  - [Prisma vs Drizzle vs TypeORM 2026 - TypeScript ORMs – Encore](https://encore.dev/articles/prisma-vs-drizzle-vs-typeorm)
  - [Prisma ORM vs Drizzle | Prisma Documentation](https://www.prisma.io/docs/orm/more/comparisons/prisma-and-drizzle)
  - [Better Auth: Database concepts (adapters overview)](https://better-auth.com/docs/concepts/database)

### drizzle-kit (migration generator/CLI) — Reconsider

**Current choice:** drizzle-kit 0.31.10 as a devDependency; drizzle.config.ts points it at src/db/schema.ts and an ./drizzle output folder containing 2 generated migration files (0000_quick_slyde.sql, 0001_omniscient_angel.sql)

**Usage evidence:** package.json has no `db:generate`/`db:migrate`/`db:push` script, and repo-wide search found zero calls to drizzle-orm's `migrate()` function anywhere in src/ or electron/. Instead, both electron/settings-store.ts and src/platform/auth/auth-database.ts apply schema via a hand-written `CREATE TABLE IF NOT EXISTS ...` raw-SQL string (SCHEMA_SQL / AUTH_SCHEMA_SQL) executed with `sqlite.exec()` on every open, which the settings-store.ts comment explicitly justifies: "better-sqlite3 needs the table to exist; drizzle won't create it." The generated ./drizzle/*.sql migrations are therefore never actually run by the app at all.

**Alternatives:** Wire up `drizzle-kit generate` + `migrate()` from `drizzle-orm/better-sqlite3/migrator` at startup (the documented, endorsed production pattern) so the TypeScript schema is the single source of truth and DDL is generated, not hand-duplicated. Or, if the team deliberately prefers idempotent inline DDL for Electron's "run on every launch, must survive partial upgrades" model, drop drizzle-kit as a dependency entirely and keep only the raw SQL (which is what's actually happening today) — that's a legitimate pattern too (`CREATE TABLE IF NOT EXISTS` is naturally idempotent, migrations are not), just not the one drizzle-kit is for.

**Reasoning:** This is dead-in-practice tooling: two DDL definitions (the Drizzle TS schema and the hand-written raw SQL string) exist per database and must be kept in sync by hand, which is exactly the kind of drift a migration tool exists to prevent. `drizzle-kit push` is explicitly documented as unsafe for production ("never use drizzle-kit push in production, it bypasses the migration file system"), and the checked-in `generate`-based migrations are the documented right way — but they're orphaned, never invoked. For an offline single-user Electron app, `CREATE TABLE IF NOT EXISTS` executed on every boot is arguably simpler and more robust than a migration runner (no migration-history table to corrupt, self-heals if a file goes missing), which may be why the team quietly abandoned drizzle-kit at runtime. Either decision is defensible, but the current state — paying for the dependency and carrying 2 stale generated migration files while not using either — is the one thing that isn't: pick the raw-SQL-DDL path explicitly and drop drizzle-kit, or actually wire the migrator in and delete the duplicate SQL strings.

**Sources:**
  - [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
  - [Migrations with Drizzle Kit (kit-overview)](https://orm.drizzle.team/docs/kit-overview)
  - [drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)
  - [Migrations with Drizzle just got better: push to SQLite is here](https://andriisherman.medium.com/migrations-with-drizzle-just-got-better-push-to-sqlite-is-here-c6c045c5d0fb)

### better-sqlite3 for Electron main-process SQLite — Well-justified

**Current choice:** better-sqlite3 ^12.10.0, opened directly in electron/settings-store.ts and src/platform/auth/auth-database.ts, rebuilt against Electron's Node ABI via electron-rebuild (per repo's native-module packaging setup)

**Usage evidence:** Sole SQLite driver for both main-process databases (auth.sqlite, settings.db, analytics.db); WAL mode + foreign_keys pragma set on every open; single cached connection per DB file (module-level `handles` Map), matching the single-process, single-user desktop model.

**Alternatives:** node:sqlite (Node 22+ built-in): zero-dependency, similar sync API, but still explicitly experimental and has no equivalent of the multiple-ciphers encrypted fork the app already relies on. libsql/@libsql/client (Turso's fork): async-only API (Promise-based even for local file mode), oriented at edge/remote-server use cases (HTTP-connected Turso databases) that don't apply to a fully offline desktop app, and async overhead buys nothing when the query itself is a same-process disk read. sql.js (WASM SQLite): built for browser/no-native-module contexts, unnecessary here since the main process has full native-module access.

**Reasoning:** better-sqlite3's synchronous API is a genuine architectural fit, not just a performance footnote: this is a single main process talking to a local file with a single reused connection, so there's no I/O concurrency to hide behind promises, and synchronous calls simplify the settings-store.ts code (no async/await ceremony around what's effectively an in-process function call). It's also the most battle-tested and fastest Node SQLite driver, and the project already has ABI-rebuild tooling (electron-rebuild) built around it, so switching away has real migration cost for no offline benefit. node:sqlite is not yet stable enough to bet a shipping desktop app's durable settings store on, and libsql's async-first design and remote-server orientation are solving a problem (network SQLite, edge replicas) this app doesn't have.

**Sources:**
  - [SQLite Driver Benchmark: better-sqlite3, node:sqlite, libSQL, Turso](https://sqg.dev/blog/sqlite-driver-benchmark/)
  - [better-sqlite3 vs libsql vs sql.js 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/better-sqlite3-vs-libsql-vs-sql-js-sqlite-nodejs-2026)
  - [better-sqlite3 - npm](https://www.npmjs.com/package/better-sqlite3)

### better-sqlite3-multiple-ciphers for at-rest encryption of the auth DB — Well-justified

**Current choice:** better-sqlite3-multiple-ciphers ^12.10.0, lazily `require()`d only when opt-in encryption is requested (auth-db-encryption.ts decides the plan; default plaintext path never even loads the encrypted binary), providing a drop-in SQLCipher-compatible `Database` with a raw-hex `PRAGMA key`

**Usage evidence:** src/platform/auth/auth-database.ts: `loadEncryptedDriver()` lazily requires the package only on the encrypted branch; `keyAndPrepareEncrypted()` runs `PRAGMA key` before any other SQL, then the identical `AUTH_SCHEMA_SQL`/pragmas used on the plaintext path. A guarded, backup-then-verify migration path (`migratePlaintextToEncrypted`) upgrades an existing plaintext DB in place.

**Alternatives:** SQLCipher itself (the reference AES-256 fork this package's cipher scheme is compatible with) — would require a different native binding entirely, more build complexity for Electron packaging, and no drop-in better-sqlite3 API compatibility. OS-level encryption (BitLocker/FileVault) instead of app-level: protects against a stolen machine only when the OS volume itself is encrypted, which the app can't assume or verify on a random Windows target machine — file-level DB encryption is a genuinely stronger, more portable guarantee for a downloadable desktop app whose users' disk-encryption posture is unknown. A separate, non-better-sqlite3 encrypted driver (e.g., stock SQLCipher's own Node bindings): loses the existing better-sqlite3 API compatibility this codebase already depends on for the plaintext path, doubling the surface to maintain.

**Reasoning:** For a local, single-user, offline desktop app, at-rest DB encryption is the appropriate layer of defense against a stolen/shared laptop rather than a network threat model, and `better-sqlite3-multiple-ciphers` is close to the only choice that keeps the exact same better-sqlite3 call surface (so `AUTH_SCHEMA_SQL`, pragmas, and drizzle wiring are unchanged) while adding SQLCipher-compatible AES-256. The opt-in, lazily-loaded, backup-verify-swap design (never loads the encrypted native binary unless the feature is actually requested, keeps a plaintext backup, verifies the encrypted copy opens before swapping) is a genuinely careful migration implementation for a feature that's easy to get destructively wrong.

**Sources:**
  - [GitHub - m4heshd/better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)
  - [SQLite3 Multiple Ciphers — SQLCipher: AES 256 Bit](https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_sqlcipher/)
  - [SQLCipher - Full Database Encryption for SQLite | Zetetic](https://www.zetetic.net/sqlcipher/)

### @better-auth/drizzle-adapter for better-auth's database layer — Well-justified

**Current choice:** drizzleAdapter(authDb, { provider: "sqlite", schema }) passed into betterAuth(authConfig) in src/platform/auth/auth.ts, backed by the same drizzle-orm schema (src/db/schema.ts) that auth-database.ts opens

**Usage evidence:** Single call site (src/platform/auth/auth.ts); the adapter is purely a bridge from better-auth's internal operations to the already-defined Drizzle schema — no custom adapter logic in app code.

**Alternatives:** better-auth's *built-in* Kysely adapter (its default/reference adapter, with migration support that Drizzle/Prisma adapters explicitly lack per better-auth's own docs — "Migration is only supported for the built-in Kysely adapter"). Prisma adapter — inherits all the Electron packaging weight discussed above, for no added benefit on a 4-table schema. MongoDB adapter — irrelevant, no document-store use case here.

**Reasoning:** Since drizzle-orm is already the chosen query builder for this process's OTHER database (settings-store.ts), reusing it for better-auth avoids introducing a second SQL-builder paradigm (Kysely) into the same main process just to gain migration support that isn't being exercised anyway (see drizzle-kit finding above — migrations aren't actually run for either DB). The marginal dependency cost of the adapter itself is minimal since drizzle-orm is already present. This is the right call as long as the drizzle-kit dead-migration issue is separately fixed; if the team instead standardizes on always hand-rolling idempotent DDL, the built-in Kysely adapter's unused migration edge wouldn't have mattered anyway.

**Sources:**
  - [Better Auth — Drizzle ORM Adapter](https://better-auth.com/docs/adapters/drizzle)
  - [Better Auth — Database concepts](https://better-auth.com/docs/concepts/database)

### Dexie (IndexedDB wrapper) for renderer-side structured persistence — Well-justified

**Current choice:** dexie ^4.4.3, instantiated as ~10+ independent per-feature/platform databases (src/platform/storage/app-db.ts is the shared platform DB with 13 tables across 3 schema versions; plus feature-local DBs: report-studio/data/db.ts, history/data/history-db.ts, help/lib/onboarding-db.ts, deep-analytics/lib/runs-store.ts, analytics-theater/model/theater-db.ts, parsed-data/store/profile-cache.ts, lineage/core/snapshot.ts, forecast-intelligence/data/forecast-db.ts, channel-monitor/db/monitor-db.ts), plus generic Dexie-based utilities (store-mirror.ts: Zustand→Dexie write-through mirror; query-persister.ts: TanStack Query dehydrate/hydrate cache blob)

**Usage evidence:** ~12-15 source files import dexie directly (versioned `.stores()` schemas with compound indexes like `[datasetId+updatedAt]`, `[source+ts]`); every write path funnels through a shared `toCloneSafeValue` sanitizer to avoid IndexedDB's structured-clone `DataCloneError` on React elements/functions. `liveQuery`/`dexie-react-hooks` is used in exactly one spot (help/lib/use-onboarding.ts) — elsewhere reactivity is deliberately handled by mirroring into Zustand stores (store-mirror.ts), not Dexie's own live-query mechanism, per that file's documented rationale ("the app keeps writing to the synchronous Zustand store as usual").

**Alternatives:** idb: a much thinner promise wrapper with no schema/versioning helper, no chainable query API, no compound-index range-query sugar — every one of this app's `[datasetId+updatedAt]`-style range queries would need to be hand-rolled against raw IDBKeyRange. localForage: simple key-value only, no indexes/range queries, wrong shape for the paginated timeline/history/profile-cache use cases here. RxDB: adds a full reactive-replication/observable layer this offline single-user app has no server to sync against, plus materially more bundle weight and conceptual overhead for a renderer bundle that already ships an offline LLM and DuckDB WASM. Raw IndexedDB: verbose callback API, manual `oldVersion` upgrade-guard bookkeeping that current guidance flags as an easy source of silent data corruption across accumulated schema versions.

**Reasoning:** Given contextIsolation:true / nodeIntegration:false in electron/main.ts, the renderer structurally cannot open better-sqlite3 — IndexedDB (via some wrapper) is not a preference here, it's the only embedded-DB surface the renderer's sandbox exposes at all. Among IndexedDB wrappers, this app's actual query shapes (paginated "newest N for a dataset/room/route" reads via compound indexes, versioned schema evolution across 3 `.version()` blocks already in production, per-feature isolated stores) are exactly Dexie's sweet spot, and current guidance converges on Dexie as "the best default for app-like IndexedDB data" for this reason. The near-total avoidance of `liveQuery` is not underuse but a considered architectural choice documented in store-mirror.ts — this app's ~20 Zustand stores are the single source of read-side reactive truth, and Dexie is deliberately used as the async durable/queryable tier underneath, not as the UI's live data source; using liveQuery pervasively would have fought that existing pattern rather than improved it.

**Sources:**
  - [Dexie.js vs localForage vs idb 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/dexie-vs-localforage-vs-idb-indexeddb-browser-storage-2026)
  - [Which IndexedDB Library Should I Use: Dexie vs idb vs RxDB? | BSWEN](https://docs.bswen.com/blog/2026-04-07-indexeddb-libraries-dexie-idb-rxdb/)
  - [RxDB — Rx-Storage-Dexie](https://rxdb.info/rx-storage-dexie.html)
  - [idb vs dexie | npm trends](https://npmtrends.com/dexie-vs-idb)

### Dual persistence layer: Drizzle-over-better-sqlite3 (main) AND Dexie-over-IndexedDB (renderer) — Well-justified

**Current choice:** Two separate, non-overlapping storage stacks by process: main process owns 2 SQLite files (auth, settings/analytics) via Drizzle for small, cross-window, security/config-sensitive key-value and auth data; renderer owns ~10+ IndexedDB databases via Dexie for larger volumes of per-feature structured records (history timelines, column profiles, import/activity logs, achievements, perf metrics, saved queries, collab annotation cache). A third tier (not in this cluster) — DuckDB — separately handles the bulk CDR/analytical data.

**Usage evidence:** electron/settings-store.ts's own header comment states the constraint directly: "the renderer can't open better-sqlite3"; confirmed structurally by electron/main.ts's `contextIsolation: true, nodeIntegration: false`. The settings bridge (createDrizzleStorage in src/platform/storage/drizzle-storage.ts) explicitly routes only small, cross-window config through IPC→SQLite with a localStorage warm cache, while everything else (large per-feature record sets needing range/pagination queries) stays local to the renderer in Dexie, never crossing IPC per-query.

**Alternatives:** Route ALL renderer persistence through IPC to the main-process SQLite (eliminate Dexie entirely): would force every one of the ~20 Zustand stores' reads/writes through an async IPC round-trip, directly undermining the synchronous-store hydration model the codebase already leans on (and that drizzle-storage.ts's localStorage-warm-cache trick exists specifically to route around for settings). It would also turn the single main process into a serialization bottleneck for high-volume per-feature logs (activity history, perf metrics, import history) that are naturally local-read/paginate workloads, not cross-window-shared config. Route main-process settings through IndexedDB-in-renderer instead of SQLite-in-main: loses the auth database's actual requirement (better-auth needs a real SQL adapter, not IndexedDB) and loses the settings store's cross-window/durable-outside-a-browsing-context guarantees a plain renderer-local IndexedDB store wouldn't provide as cleanly.

**Reasoning:** This isn't two competing solutions to the same problem — it's Electron's actual process-isolation boundary (a hard OS/security-model constraint, not a style choice) determining which storage engines are even reachable from each side, plus a genuine difference in data shape and lifecycle: main-process data is small, security-sensitive, cross-window-shared config (settings, auth) that benefits from a real relational file with pragma-level durability guarantees, while renderer data is large-volume, per-feature, locally-queried structured records (timelines, profiles, logs) that would be actively harmed by forcing them through an IPC round trip per read. Collapsing either direction (SQLite-only or IndexedDB-only) would fight the renderer sandbox, the sync-store architecture, or better-auth's requirements — so maintaining both is the correct call for this specific offline single-process-but-two-context desktop app, not redundancy to be trimmed.

**Sources:**
  - [RxDB — Electron Database (Storage adapters for SQLite, Filesystem and In-Memory)](https://rxdb.info/electron-database.html)
  - [Building an Electron App Offline-First (Local-First Architecture)](https://medium.com/@raamsri/building-an-electron-app-offline-first-local-first-architecture-for-privacy-desktop-software-ed32bc7384d9)
  - [Electron docs — contextIsolation / process model](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

---

## Local SQL / dataframe engines

_Packages: @duckdb/node-api, alasql, sql.js, nodejs-polars, arquero, hyparquet, sqlite-vec, node-sql-parser, monaco-sql-languages, apache-arrow, @uwdata/flechette_

**Cluster sanity-check:** The researcher's verdicts are unusually well-grounded: nearly every claim (DuckDB-Neo lacking native Arrow-IPC export, the apache-arrow/flechette main-vs-renderer split, the single-dialect node-sql-parser build, sqlite-vec's presence in forge.config.ts's asarUnpackDirs/native-copy lists, hyparquet's zero src usage, monaco-sql-languages' zero wiring) is verbatim-confirmable in the actual code and correctly reasons from this app's Electron-only, offline, non-SaaS packaging pipeline rather than generic web-package hygiene. The one place the researcher was inconsistent with its own standard is arquero: it treated arquero as 'misclassified, identical to the benchmark-only alasql/sql.js/nodejs-polars trio,' but the repo's own multi-file planning docs (dependency-catalog.md's 'already-installed-unused' status with 'Used by: csv-parser, data-transform, data-formulator', and data-transform.md's 'Already a dependency... replaces hand-rolled regex applyFilter') show arquero has a distinct, specific, still-live planned production role that alasql/sql.js/nodejs-polars never had anywhere in the docs. That's the exact same 'not wired in yet, but a real documented plan exists' fact pattern the researcher correctly used to justify a softer verdict for sqlite-vec and monaco-sql-languages, so arquero deserves the same treatment rather than a flat 'fix the misclassification' framing.

### DuckDB native (@duckdb/node-api) as the sole shipped SQL/analytics engine — Well-justified

**Current choice:** @duckdb/node-api 1.5.3-r.3, run entirely in the Electron main process

**Usage evidence:** Genuinely used across 7 files (electron/duckdb-service.ts, electron/duckdb-arrow.ts, electron/workers/duckdb.utility.ts, electron/sql-guard.ts, electron/preload.ts, electron/ipc-validation.ts, electron/main.ts) plus the renderer's read-only DuckDB path (src/platform/duckdb/*). This is confirmed as the app's real primary engine, not just a package.json entry.

**Alternatives:** sql.js (pure-WASM SQLite), alasql (pure-JS SQL), nodejs-polars (Rust lazy dataframe via napi), node:sqlite / better-sqlite3 (row-store SQL) are the realistic embedded alternatives for 2025-2026 Node/Electron apps. Kestra's 2026 'Embedded Databases' roundup groups DuckDB, SQLite and Polars as the tools that now cover most embedded analytical workloads.

**Reasoning:** This isn't a generic pick — the repo carries its own receipts: scripts/bench-engines.mjs is a dev-only harness that generates a deterministic 1M-row synthetic telecom CDR CSV (matching this app's actual DailyTransactions domain) and benchmarks DuckDB (both the app's real VARCHAR+TRY_CAST access pattern and a typed variant) against Polars, node:sqlite, better-sqlite3, sql.js and alasql on the exact GROUP BY + filtered-COUNT queries the app runs, cross-checking correctness. That is the right way to make this call for a single-process, offline, medium-end-PC app: real workload, real hardware class, not a generic 'DuckDB is fast' assumption. Given the renderer DuckDB instance is read-only (per prior architecture notes) and the main-process instance does the heavy lifting, keeping one native columnar engine as the source of truth avoids the classic mistake of shipping N SQL dialects for a single local user.

**Sources:**
  - [Node.js API – DuckDB](https://duckdb.org/docs/lts/clients/nodejs/reference)
  - [duckdb/duckdb-node on GitHub](https://github.com/duckdb/duckdb-node)
  - [Embedded Databases in 2026: DuckDB, SQLite, Polars, and chDB | Kestra](https://kestra.io/blogs/embedded-databases)

### alasql / sql.js / nodejs-polars kept only as devDependencies for a rejection benchmark — Well-justified

**Current choice:** All three live under package.json devDependencies and are consumed exclusively by scripts/bench-engines.mjs (pnpm bench:engines), never imported anywhere under src/ or electron/

**Usage evidence:** grep across src/ and electron/ finds zero imports of alasql, sql.js, or nodejs-polars. `node -e` inspection of package.json confirms all three are devDependencies (not dependencies), so pnpm prune / Forge packaging drops them from the shipped app. Their only call sites are `await import(...)` inside scripts/bench-engines.mjs's alasqlEngine/sqlJsEngine/polarsEngine helpers.

**Alternatives:** The alternative pattern (seen elsewhere in this same cluster, see the 'arquero' finding below) is to leave a benchmark-only dependency as a hard production dependency, which silently ships it in every install for zero runtime benefit.

**Reasoning:** For an offline single-user desktop app, this is exactly the right way to retire a 'we compared and rejected' decision: keep the losing engines as devDependencies so `pnpm bench:engines` stays reproducible for future re-evaluation (e.g. if DuckDB's Node bindings regress, or Polars' napi bindings mature further) without paying their install-size or supply-chain cost in every user's packaged app. This app's own memory shows install size is already a live problem (the packaged app is large enough that Squirrel's Setup.exe update-resource step fails), so keeping rejected engines out of `dependencies` is a real, non-cosmetic win, not just tidiness.

**Sources:**
  - [Reserve devDependencies for build-only tooling to shrink final package size — How to Reduce the Size of an Electron App Installer](https://medium.com/gowombat/how-to-reduce-the-size-of-an-electron-app-installer-a2bc88a37732)

### apache-arrow (Electron main, write side) + @uwdata/flechette (renderer/worker, read side) split — Well-justified

**Current choice:** apache-arrow ^21.1.0 used only in electron/duckdb-arrow.ts to build Arrow IPC bytes from DuckDB's native columnar output; @uwdata/flechette ^2.5.0 used only in src/platform/duckdb/arrow-ipc.ts and src/workers/parse.worker.ts to decode those bytes

**Usage evidence:** electron/duckdb-arrow.ts imports `tableFromArrays, tableToIPC` from apache-arrow and its own header comment states it is 'imported only by electron/duckdb-service.ts; it pulls apache-arrow into MAIN, never the renderer.' src/platform/duckdb/arrow-ipc.ts and src/workers/parse.worker.ts import `tableFromIPC`/column types from @uwdata/flechette for renderer/worker-side decode. No file imports both packages for the same direction.

**Alternatives:** Using apache-arrow (the reference JS implementation) end-to-end everywhere, or waiting on DuckDB's own community `arrow`/`nanoarrow` extension to emit Arrow IPC directly from SQL (`INSTALL nanoarrow FROM community; LOAD nanoarrow;`).

**Reasoning:** This split is deliberate and correctly targeted at this app's offline constraint, not accidental duplication. DuckDB Neo's @duckdb/node-api has no native Arrow-IPC export, and the real Arrow support in DuckDB now lives in the `nanoarrow` community extension, which as of DuckDB 1.3 must be fetched via `INSTALL nanoarrow FROM community` — a network call this app cannot make at runtime. So apache-arrow is used purely as a pure-JS encoder in the main process (no network, no native DuckDB extension needed) to hand-build the IPC bytes DuckDB itself can't emit offline. On the renderer/worker side, flechette is measurably the better fit for a medium-end-PC single-user app: ~14kB gzip vs ~43kB gzip, and 2-11x faster row/array extraction than apache-arrow, which matters when the reader runs on every dataset load and on hardware you don't control. Arquero itself switched its default Arrow handler to flechette for the same reasons. Using the heavy encoder only where writing is required and the light decoder everywhere reads dominate is the correct allocation, not redundant overlap.

**Sources:**
  - [nanoarrow – DuckDB Community Extensions](https://duckdb.org/community_extensions/extensions/nanoarrow)
  - [Arrow IPC Support in DuckDB](https://duckdb.org/2025/05/23/arrow-ipc-support-in-duckdb)
  - [Community Extensions – DuckDB (network install requirement)](https://duckdb.org/docs/lts/extensions/community_extensions)
  - [uwdata/flechette: Fast, lightweight access to Apache Arrow data](https://github.com/uwdata/flechette)
  - [Flechette docs (bundle size / perf numbers)](https://idl.uw.edu/flechette/)

### node-sql-parser (single-dialect postgresql build) for offline SQL AST validation and column lineage — Well-justified

**Current choice:** node-sql-parser ^5.4.0, imported only from the slim `node-sql-parser/build/postgresql` entry (~150KB), used in src/features/data-transform/engine/validate.ts (worker-side recipe linting) and src/features/lineage/core/sql-lineage.ts (SQL→column lineage graph)

**Usage evidence:** Both real import sites use `import { Parser } from "node-sql-parser/build/postgresql"` specifically to avoid the full multi-dialect bundle. Both are wired into Web Workers (src/features/data-transform/workers/transform.worker.ts and src/features/lineage/worker/lineage.worker.ts) rather than the main render thread. monaco-sql-languages, by contrast, is never imported anywhere (see finding below) — the Monaco SQL editors in DataTransformScreen/DataBrowserScreen use the plain built-in `language="sql"` from @monaco-editor/react.

**Alternatives:** sql-parser-cst, pgsql-parser (native libpg_query wrapper, heavier/native-binding), or delegating validation/lineage to DuckDB's own `EXPLAIN`/`PRAGMA` output round-tripped over IPC.

**Reasoning:** This is a real, distinct need DuckDB itself can't satisfy for this app's architecture: linting a SQL recipe or deriving column lineage before a query runs (or without round-tripping to the main-process DuckDB connection on every keystroke) requires a local, dependency-free AST, and it must work fully offline with no cloud SQL-linting service. Pulling the single-dialect postgresql build instead of the full multi-dialect bundle is the correct size-conscious choice given this app already tracks bundle weight closely (per-worker size-limit budgets elsewhere in the repo), and running the parse in a Worker keeps it off the interaction thread on medium-end hardware. This is not overlapping with DuckDB — it is the renderer-safe, no-round-trip complement to it.

**Sources:**
  - [node-sql-parser – npm](https://www.npmjs.com/package/node-sql-parser)
  - [taozhi8833998/node-sql-parser on GitHub](https://github.com/taozhi8833998/node-sql-parser)

### arquero — misclassified as a production dependency despite benchmark-only usage — Right tool, underused

**Current choice:** arquero ^8.0.3 sits in package.json `dependencies` (not devDependencies)

**Usage evidence:** The ONLY real import of arquero anywhere in the repo is `const aq = await import("arquero")` inside scripts/bench-engines.mjs's arqueroEngine() — the same dev-only comparison harness that uses alasql/sql.js/nodejs-polars (which ARE correctly placed in devDependencies). knip's own dependency-usage scan does not flag arquero as unused only because knip's entry globs include scripts/**/*.mjs, so it 'sees' the dynamic import in the benchmark script — it is not used by any src/ or electron/ file. src/features/csv-parser/lib/filter.ts's docstring mentions arquero's filter/escape API as design inspiration ('so it can drive arquero's filter/escape just as well as a manual loop') but that file contains no arquero import — compileFilter() is a hand-rolled regex-based predicate compiler.

**Alternatives:** Move arquero to devDependencies (matching alasql/sql.js/nodejs-polars), or drop it entirely from package.json if the benchmark script can run via a one-off `pnpm dlx arquero`/ad-hoc install instead.

**Reasoning:** This is an internal inconsistency the repo's own pattern already tells you how to fix: alasql, sql.js and nodejs-polars serve the identical role (benchmark-only, dynamically imported by scripts/bench-engines.mjs) and were correctly demoted to devDependencies so they never ship in the packaged Electron app. arquero plays the exact same role but was left in `dependencies`, meaning it and its transitive deps are currently bundled into every install for zero runtime benefit — pure asymmetry, not a deliberate design choice. Given this app's documented install-size sensitivity, this is a low-risk, high-clarity fix: reclassify arquero as a devDependency (or remove it) to match its actual usage.

> **Verify override:** was "Reconsider", changed to "Right tool, underused" — Code evidence confirms arquero has zero real production import today (only a code comment reference plus the dynamic import inside scripts/bench-engines.mjs, exactly like alasql/sql.js/nodejs-polars). But unlike those three — which appear nowhere else in the codebase or docs — arquero also carries a distinct, specific, still-active plan documented across multiple project files: docs/planning/v2/dependency-catalog.md lists it under 'already-installed-unused (43)' with 'Used by: csv-parser, data-transform, data-formulator... replaces hand-rolled regex applyFilter', and docs/planning/v2/features/data-transform.md says 'Already a dependency. Use for small/medium client-side reshaping (pivot/unpivot, derived columns) where a DuckDB round-trip is overkill.' src/features/csv-parser/lib/filter.ts's regex-based compileFilter even has a comment explicitly citing arquero's filter/escape design as the reference it's mirroring. This is the same 'unwired but concretely planned' shape the researcher itself used to justify a nuanced verdict for sqlite-vec (native-packaging cost for a planned data-formulator feature) and monaco-sql-languages (real UX gap, just not wired). Demoting arquero to devDependencies to mirror the three purely-rejected benchmark engines would work against the documented plan; 'right-tool-underused' (or a sqlite-vec-style 'reconsider the cost/benefit of keeping it staged') fits the evidence better than 'misclassified, identical role to alasql/sql.js/nodejs-polars.'

**Sources:**
  - [uwdata/arquero on GitHub](https://github.com/uwdata/arquero)
  - [Reserve devDependencies for build/dev-only tooling to shrink final package size](https://medium.com/gowombat/how-to-reduce-the-size-of-an-electron-app-installer-a2bc88a37732)

### hyparquet — unused dependency, redundant with DuckDB's built-in Parquet support — Redundant with sibling dependency

**Current choice:** hyparquet ^1.26.0 in package.json `dependencies`

**Usage evidence:** Zero imports anywhere in src/, electron/, or scripts/ (confirmed both by targeted grep and by running `pnpm exec knip --dependencies`, which lists hyparquet under 'Unused dependencies'). Its only references are package.json/pnpm-lock.yaml and docs/planning/v2 planning briefs, which describe it as an OPTIONAL pure-JS Parquet preview for a 'browser/non-Electron path.' That doc explicitly says: 'Browser/non-Electron path is a dead end: onDrop() only sets a notice string ... There is no offline File-based fallback' — i.e. the feature it was added for was never built and the app itself documents that path as unreachable.

**Alternatives:** DuckDB's own `read_parquet()`, which is already used at 5+ call sites in electron/duckdb-service.ts and is a bundled/built-in DuckDB extension (unlike the Arrow extension, Parquet does not require a network `INSTALL FROM community` call) so it works fully offline today with zero extra dependency weight.

**Reasoning:** This app is Electron-only in practice — every real Parquet path already goes through the main-process DuckDB instance's native, offline-capable `read_parquet()`. hyparquet's stated purpose (peek at Parquet metadata/rows without booting a full engine) only matters for a hypothetical browser-only build that this repo's own planning docs admit does not exist and was never wired up. Carrying an unused native-adjacent parser as a hard `dependencies` entry adds install size and supply-chain surface (OWASP's 2025 Top 10 now has a dedicated 'Software Supply Chain Failures' category, and 2025 saw large npm worm attacks) for a code path that cannot currently be reached. Either drop it, or move it to devDependencies until the browser-fallback feature is actually implemented.

**Sources:**
  - [Reading and Writing Parquet Files – DuckDB (bundled, no separate install)](https://duckdb.org/docs/current/data/parquet/overview)
  - [A03 Software Supply Chain Failures - OWASP Top 10:2025](https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/)
  - [CISA: Widespread Supply Chain Compromise Impacting npm Ecosystem (2025)](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)

### sqlite-vec — unused today, but paying real native-packaging cost for a planned feature — Reconsider

**Current choice:** sqlite-vec ^0.1.9 in package.json `dependencies`, and explicitly added to forge.config.ts's ASAR-unpack list (`node_modules/sqlite-vec`, alongside better-sqlite3) so it is treated as a native module during packaging

**Usage evidence:** No `loadExtension`/`vec0`/sqlite-vec import anywhere in src/ or electron/ (confirmed by grep and by knip flagging it under 'Unused dependencies'). docs/planning/v2/features/data-formulator.md specs it out in detail as the intended persistent store for per-dataset row embeddings in the Moudir/Data-Formulator vector-search rewrite ('Persist per-dataset row embeddings in SQLite (better-sqlite3) ... so the semantic index survives restarts'), replacing today's actual implementation: an in-memory brute-force cosine scan in src/platform/ai/embeddings.ts that is rebuilt every session.

**Alternatives:** usearch (WASM ANN) is already named in the same planning doc as the browser-fallback alternative; libSQL's built-in vector search is another option if the app ever forks off SQLite; the current in-memory brute-force cosine scan is the de facto fallback already shipping.

**Reasoning:** Unlike hyparquet, this isn't conceptually redundant — nothing else in the cluster does persistent vector search, and the planned use (persisting embeddings across restarts for the AI dataset-search feature) is a real, well-specified need for an offline app that can't re-embed 2000+ rows every session on a medium-end PC. But right now it is 100% dead weight: it is a native module (per Mozilla-backed asg017/sqlite-vec, still pre-1.0/alpha as of 2025-2026, meaning breaking API changes are still expected) that forge.config.ts already special-cases for ASAR-unpacking — i.e. the packaging pipeline pays the 'native binary shipped per-platform, unpacked from asar' cost in every user's install today, for a feature with zero call sites. Given this app's own install-size problems (the packaged build is already large enough to break Squirrel's installer), either implement the wiring now (it's already fully spec'd in docs/planning/v2/features/data-formulator.md §2.2) or defer adding it to package.json/forge.config.ts until that work actually starts, and re-add once there's a landing call site.

**Sources:**
  - [asg017/sqlite-vec: A vector search SQLite extension that runs anywhere](https://github.com/asg017/sqlite-vec)
  - [Knip: unused dependencies detection](https://knip.dev/typescript/unused-dependencies)

### monaco-sql-languages — right tool for existing Monaco SQL editors, but never wired in — Right tool, underused

**Current choice:** monaco-sql-languages ^1.1.0 in package.json `dependencies`

**Usage evidence:** Zero imports/registerLanguage calls anywhere in src/ (confirmed by grep and by `pnpm exec knip --dependencies` flagging it under 'Unused dependencies'). The app DOES have multiple real Monaco-based SQL editing surfaces that would benefit from it — @monaco-editor/react is genuinely used in 5 files (DataTransformScreen.tsx, DataBrowserScreen.tsx, agent-canvas's SqlIdePanel.tsx/WidgetCard.tsx/NarrativePanel.tsx) — but DataTransformScreen.tsx configures the editor with the plain built-in `language="sql"`, which is Monaco's generic (dialect-unaware, no real autocomplete) SQL tokenizer, not monaco-sql-languages' dialect-specific language service.

**Alternatives:** Keep the plain built-in `sql` language mode (current de facto state); or wire in monaco-sql-languages for DuckDB/PostgreSQL-aware syntax highlighting and column/table completion in the SQL IDE panels.

**Reasoning:** This is different from hyparquet/sqlite-vec: it isn't solving a problem that doesn't exist in this app — this app genuinely has several hand-authored SQL editing surfaces (data-transform recipes, the agent-canvas SqlIdePanel) where richer SQL completion would be a real, single-user-facing UX improvement, and the team already correctly identified and installed the tool for it. It's simply unfinished integration work, not a wrong bet. Given the app already ships node-sql-parser for AST-level validation/lineage on the same SQL strings, wiring monaco-sql-languages in for editor-time completion would reuse work already done rather than add a new decision — but until that wiring lands, it is inert weight identical in effect to the other unused entries.

**Sources:**
  - [Knip: Declutter your JavaScript & TypeScript projects](https://knip.dev/)

---

## Compute placement: Web Workers vs Next.js API routes vs Electron utilityProcess

_Packages: comlink, next (App Router API routes), electron utilityProcess_

**Cluster sanity-check:** All three verdicts hold up under adversarial review with the offline/single-process/small-LAN context specifically accounted for, not ignored. Verified directly in the repo: the main process is genuinely crowded (electron/main.ts embeds the Next server via start-server/customServer:true, hosts electron/llama-service.ts running node-llama-cpp synchronously, and registers 56 ipcMain.handle channels including ~15 DuckDB query/profile handlers) — so the comlink-worker verdict is well grounded, and its renderer-side inference.worker.ts is explicitly documented as 'Lane B' (transformers.js/WASM fallback for web-build/no-GGUF), a genuinely different sub-problem from the main-process node-llama-cpp 'Lane A', not redundant with it. The Next.js API-route verdict is also accurate: only one route exists (src/app/api/auth/[...all]/route.ts for better-auth), served from the same OS process on a dynamic localhost port, matching the researcher's 'contained rather than harmful' framing rather than treating it as a microservices anti-pattern. The utilityProcess verdict is actually understated, not overclaimed: the codebase already contains an off-by-default utilityProcess scaffold for DuckDB (electron/workers/duckdb-utility-broker.ts + duckdb.utility.ts, gated behind DN_DUCKDB_UTILITY=1) whose own comments state the team's blueprint — 'native parsers (DuckDB/llama) should run in a utilityProcess isolated from the secret-holding main' — yet llama-service.ts (arguably the more CPU/GPU-intensive, crash-prone native workload) has no such isolation at all, and the DuckDB scaffold itself is not the default path. This is first-party evidence, not generic web-app advice, that the tool is legitimately underused here, and the single-process/LAN-hub nature of this app makes a main-process crash more costly (it would also kill the embedded HTTP server for any connected LAN peers), reinforcing rather than undermining the verdict.

### Comlink-wrapped renderer Web Workers for CPU-bound analysis compute — Well-justified

**Current choice:** Comlink `expose()`/`wrap()` RPC over plain browser `Worker` instances, one worker per compute domain, each with a typed `*-client.ts` proxy consumed by Zustand stores/hooks in the renderer.

**Usage evidence:** 12 worker modules under src/workers/ (2,398 lines: analysis.worker.ts, chart.worker.ts, parse.worker.ts, layout.worker.ts, export.worker.ts, inference.worker.ts, python-sandbox.worker.ts, ...) plus feature-local workers (src/features/data-transform/workers/transform.worker.ts, src/features/lineage/worker/lineage.worker.ts, src/features/csv-parser/workers/useCsvWorker.ts). 18 files do `new Worker(...)` + `Comlink.wrap`, each behind a dedicated `*-client.ts` (analysis-client.ts, chart-client.ts, layout-client.ts, parse-client.ts, export-client.ts, inference-client.ts, ml-client.ts). `comlink` (^4.4.2) is a first-class package.json dependency, not incidental. Every one of these workers is deliberately native-module-free (transformers.js/ONNX WASM, self-hosted Pyodide WASM, pure-JS math) — the opposite class of workload from electron/llama-service.ts, whose own header comment states "node-llama-cpp runs ONLY in the Electron main process. Importing it in the renderer crashes the app", confirming the codebase already draws the native-vs-portable line deliberately.

**Alternatives:** (a) Route the same work through the embedded Next.js standalone server as an API route handled in Electron main (customServer:true); (b) Electron utilityProcess, either with a hand-rolled MessagePortMain protocol (as already built for DuckDB reads) or Comlink's Node worker_threads adapter; (c) Node worker_threads spawned directly from main; (d) run it inline on the renderer main thread (the un-offloaded baseline, clearly wrong for CPU-heavy work).

**Reasoning:** This app's main process is already crowded: an embedded Next.js HTTP server (start-server, customServer:true), DuckDB native bindings, node-llama-cpp, and 55 ipcMain.handle channels share one event loop — a documented contention risk from a prior audit. Pushing more CPU-bound work (chart layout, CSV parsing, export rasterization) through main via IPC or an API route would only add to that queue for zero benefit, since the result is only needed by the same renderer window that requested it. Renderer-side Web Workers instead run on a completely separate OS thread parallel to both the UI thread and the main process, reachable via same-process postMessage with optional zero-copy Transferable ArrayBuffers (O(1) transfer regardless of payload size), versus crossing the renderer-to-main IPC boundary (structured-clone serialization on both sides, plus HTTP parse/route overhead if it were an API route) for work nothing in main needs to see. Electron's own docs and community reports (electron/electron#43513) confirm native addons crash inside Web Workers/worker_threads — but that's moot here because these workers are intentionally kept to portable WASM/pure-JS compute; the one workload class that genuinely needs native bindings (node-llama-cpp) is correctly excluded and kept in main instead, per the codebase's own explicit comment. Given single-user/offline/medium-end-PC constraints, there's no multi-tenant or crash-isolation requirement pushing this toward the heavier utilityProcess tool (that's reserved for untrusted/crash-prone/native work); Web Workers are correctly right-sized, and their per-window lifecycle (spun up/torn down with the view) fits interactive, session-scoped recompute (filter changes, re-layout) better than a stateless HTTP route or a long-lived utilityProcess service would.

**Sources:**
  - [Performance | Electron](https://www.electronjs.org/docs/latest/tutorial/performance)
  - [Process Model | Electron](https://www.electronjs.org/docs/latest/tutorial/process-model)
  - [Inter-Process Communication | Electron](https://www.electronjs.org/docs/latest/tutorial/ipc)
  - [refactor: use v8 serialization for ipc (electron/electron#20214)](https://github.com/electron/electron/pull/20214)
  - [[Bug]: Cannot use native module better-sqlite3 in electron worker_thread (electron/electron#43513)](https://github.com/electron/electron/issues/43513)
  - [GitHub - GoogleChromeLabs/comlink](https://github.com/googlechromelabs/comlink)

### Next.js App Router API routes as a compute-placement mechanism — Well-justified

**Current choice:** Not used for compute at all. The only Route Handler in the codebase is the forced better-auth catch-all, src/app/api/auth/[...all]/route.ts (`export const { GET, POST } = toNextJsHandler(auth)`), required by better-auth's Next.js integration contract. Zero `fetch("/api/...")` call sites exist anywhere for analysis/report/chart/parse/export/LLM work — all of that goes through Web Workers (renderer) or ipcMain.handle (main).

**Usage evidence:** `find src/app -iname route.ts` returns exactly one file. Repo-wide grep for `fetch("/api`, `fetch('/api`, and `fetch(\`/api` returns zero matches. `@better-auth/electron` is also a dependency, but it's wired only into the renderer auth client (electron/auth-client.ts) to add deep-link OAuth callback handling; its `baseURL` still points at the same in-process HTTP server (`http://localhost:3000` per src/platform/auth/auth.ts), so it augments the HTTP transport rather than replacing it.

**Alternatives:** better-auth also ships `toNodeHandler` for plain Node/Express-style servers, which would remove the Next.js Route Handler dependency entirely — at the cost of either standing up a second bespoke HTTP listener in main solely for auth, or reworking better-auth's cookie/session model onto ipcMain.handle (a materially bigger change to a well-tested library's assumptions).

**Reasoning:** Directly on the question of whether API routes make sense here or are a vestige of web-app thinking: both are true, but the vestige is contained rather than harmful. better-auth is fundamentally a client/server-over-HTTP auth library; in this single-process offline desktop app the 'client' and 'server' are the same physical process talking to itself over loopback, cookies and all — a genuinely web-shaped assumption for a single local user who doesn't need session isolation. But it costs nothing extra: the Next.js standalone server is already embedded in Electron main to serve the UI regardless, so piggybacking one required route on it is zero marginal process/port cost, and it's confined to exactly the one thing that forces it. More importantly, the app's own architecture makes API routes a strictly worse choice than IPC for compute even in principle, not just in current practice: because next/dist/server/lib/start-server runs with customServer:true directly inside the Electron main process, any API route handler executes on the exact same single Node.js event loop as DuckDB's native bindings, node-llama-cpp generation, and all 55 ipcMain.handle channels. Unlike a real deployed Next.js app (where a request can be load-balanced across separate OS processes and Node's async I/O model tolerates many concurrent short requests), an API route here buys zero isolation over an ipcMain.handle call — it only adds HTTP parsing/routing overhead on top of the same shared-event-loop contention the prior audit already flagged. So there is no scenario in which moving analysis compute from IPC to a Next.js API route would help; the correct move is exactly what the codebase does — keep this integration surface as narrow as the one library that mandates it, and never treat it as a general RPC path.

**Sources:**
  - [Building an Electron App with Next.js (DoltHub Blog)](https://www.dolthub.com/blog/2024-09-11-building-an-electron-app-with-nextjs/)
  - [The ultimate Electron app with Next.js and React Server Components](https://medium.com/@kirill.konshin/the-ultimate-electron-app-with-next-js-and-react-server-components-a5c0cabda72b)
  - [Next.js integration | Better Auth](https://better-auth.com/docs/integrations/next)
  - [Process Model | Electron](https://www.electronjs.org/docs/latest/tutorial/process-model)

### Electron utilityProcess for isolating native/crash-prone compute from main — Right tool, underused

**Current choice:** An opt-in, OFF-by-default utilityProcess isolation scaffold exists for DuckDB READ channels only: electron/workers/duckdb-utility-broker.ts (`utilityProcess.fork`) + duckdb.utility.ts + a hand-rolled, dependency-free, id-correlated MessagePortMain protocol (duckdb-utility-protocol.ts), gated by `DN_DUCKDB_UTILITY=1` and explicitly documented as a security 'isolation scaffold' to keep renderer-reachable DuckDB reads away from the secret-holding main process. The other native-addon-bound, long-running compute path — node-llama-cpp generation in electron/llama-service.ts — has no utilityProcess isolation and runs straight in main behind ipcMain.handle('llama:*').

**Usage evidence:** `utilityProcess` appears only inside electron/workers/ (duckdb-utility-broker.ts); zero other usages repo-wide. duckdb-utility-broker.ts's own header comment frames it as a 'SAFETY / ADDITIVE CONTRACT... OFF BY DEFAULT' scaffold, and states the broker 'passes ONLY non-secret directory locations to the child; the auth secret / auth DB never cross this boundary' — a security-isolation motive. It also self-heals: 'a child crash rejects in-flight requests and resets state so the next call transparently re-forks.' electron/llama-service.ts's header states plainly: 'node-llama-cpp runs ONLY in the Electron main process... it lives here behind IPC (`llama:*`)' and 'Requests are serialized through a queue: one context sequence generates one sequence at a time' — confirming llama generation is main-process-resident, singleton, and has no comparable isolation.

**Alternatives:** (a) Extend the already-built broker pattern to llama-service, forking node-llama-cpp into its own utilityProcess (Electron's docs list exactly this — 'CPU intensive tasks or crash-prone components' — as the intended use case, and recommend utilityProcess over child_process.fork/worker_threads specifically because it retains a full Node.js environment that can load native modules, unlike Web Workers); (b) leave it in main as today; (c) use Node worker_threads instead of utilityProcess (implicitly and correctly rejected already, since native addons are documented to crash inside worker_threads/Web Workers per electron/electron#43513).

**Reasoning:** Electron's official docs are explicit that utilityProcess exists precisely to host 'untrusted services, CPU intensive tasks or crash-prone components which would have previously been hosted in the main process,' and to be preferred over child_process.fork when a child process is needed at all. This app's own prior audit already flagged main-process contention (DuckDB + node-llama-cpp + 55 IPC handlers on one event loop) as a real risk — exactly the scenario utilityProcess is designed to relieve. The DuckDB read-isolation scaffold is a reasonable, cautious first application of the pattern (additive, off-by-default, narrowly scoped, with a proven crash/re-fork resilience story), but it is scoped to a SECURITY motive (keep renderer-reachable reads away from the secret-holding main), not the contention/crash-isolation motive this cluster is actually asking about. node-llama-cpp is arguably the stronger candidate on that ground: it is a native C++ binding doing long (seconds-to-minutes on the medium-end, CPU-only-by-default hardware this app targets) generation calls — the textbook 'long-running CPU-heavy task' and 'crash-prone native component' the docs describe. Today, a native fault during model load or generation takes down the same process hosting DuckDB and the embedded Next.js server, with no supervisor to recover it, whereas a utilityProcess crash can be caught and the child re-forked — the exact resilience contract this codebase already implemented once for DuckDB. The concurrency argument doesn't apply (llama-service already self-serializes to one generation at a time, so there's no parallelism to gain), which is likely why it wasn't an obvious priority — but the fault-isolation and event-loop-contention argument still holds, and extending the already-proven broker pattern to llama-service is a small, additive next increment rather than new architecture, not a wholesale reconsideration of the current design.

**Sources:**
  - [Process Model | Electron](https://www.electronjs.org/docs/latest/tutorial/process-model)
  - [Performance | Electron](https://www.electronjs.org/docs/latest/tutorial/performance)
  - [utilityProcess | Electron](https://www.electronjs.org/docs/latest/api/utility-process)
  - [Multithreading | Electron](https://www.electronjs.org/docs/latest/tutorial/multithreading)
  - [[Bug]: Cannot use native module better-sqlite3 in electron worker_thread (electron/electron#43513)](https://github.com/electron/electron/issues/43513)

---

## Local LLM / AI inference stack

_Packages: node-llama-cpp, @huggingface/transformers, @mlc-ai/web-llm, onnxruntime-node, onnxruntime-web, @langchain/core, @langchain/langgraph, @ag-ui/client, @ag-ui/core, kokoro-js, sherpa-onnx-node_

**Cluster sanity-check:** The researcher's calls hold up well against direct code inspection: node-llama-cpp is genuinely load-bearing across 12+ call sites with an explicit GBNF grammar differentiator; @ag-ui/client and @ag-ui/core have zero imports anywhere in src (ag-ui-types.ts explicitly says "Implemented inline (mirrors @ag-ui/core spec 2025)"), confirming true dead weight, not a generic-web overreaction; @langchain/langgraph's use of interrupt(), Command({resume}), addConditionalEdges, and a MemorySaver checkpointer in a 651-line pipeline is genuinely deep, and a sibling hand-rolled orchestrator (data-formulator/core/swarm) was checked and is a much simpler linear 3-tier router with no cyclic/HITL/checkpoint needs, so it is not a hidden redundant competitor to LangGraph; the kokoro-js/sherpa-onnx-node split is confirmed as genuinely different runtime contexts (sherpa-onnx-node loaded natively in electron/voice-service.ts for the Electron main process, kokoro-js dynamically imported inside Web Workers) rather than incidental duplication. The one place the reasoning is shaky is web-llm: the quoted rationale (WebGPU driver-hang caveats "is precisely why the team already demoted this to explicit opt-in") actually argues the current design is correct, which reads more like grounds for "well-justified" than "reconsider." However, independent verification found a stronger, unmentioned reason the "reconsider" verdict is still right: `setWebLLMOptIn()` is exported but never called from any Settings/UI component in the entire src tree (only from unit tests via localStorage.setItem) — so today this WebGPU LLM runtime is 100% unreachable by a real user despite being fully wired into the provider registry. That's a more solid basis for "reconsider" than the one given, so I'm not overriding the bucket, just noting the stated justification doesn't match the actual strongest evidence. onnxruntime-node's "right-tool-underused" is defensible (documented against 4 concrete roadmap features in dependency-catalog.md, and its native binary is already deliberately pruned to win32/x64-only in forge.config.ts, showing real packaging discipline rather than oversight) — though this app has a documented history of Electron native-module ABI pain (better-sqlite3 needing special Electron rebuilds), which is a project-specific reason to weigh "defer this second native module until the feature actually lands" a bit more heavily than the snippet does; it's a legitimate softening point but not strong enough to flip the category outright.

### node-llama-cpp as the primary Electron-main-process LLM engine — Well-justified

**Current choice:** node-llama-cpp@3.18.1, run exclusively in the Electron main process (electron/llama-service.ts), exposed to the renderer via a thin IPC bridge (src/platform/ai/provider/adapters/llamacpp.ts -> window.electronLlama). Ranked #1 in the provider preference order in src/platform/ai/provider/registry.ts ("llamacpp -> transformers -> webllm -> ollama -> openai"). GBNF/JSON-schema grammar makes generateStructured() valid-by-construction (src/platform/ai/provider/adapters/llamacpp.ts:162-192).

**Usage evidence:** 12 files under src/ reference node-llama-cpp/llamacpp; it is the sole `structuredNative: true` provider. package.json pins v3.18.1 (~34MB unpacked). forge.config.ts's pruneOversizedNativeBinaries() specifically strips CUDA/arm64 backends (~580MB) and keeps only win-x64 + win-x64-vulkan, confirming it's a live, actively-packaged runtime, not vestigial. An internal engineering brief (docs/planning/v2/fast-offline-inference-brainstorm.md, dated 2026-06-15) already profiled quantization, threading, prefix-cache, and a BitNet alternative against this exact engine on the app's declared 4-core/8GB/no-WebGPU target.

**Alternatives:** Ollama (external daemon; contradicts the single-process offline-first design, adds a ~200MB install + pull/create UX step, and the app's own research doc flags `electron-ollama`'s default runtime auto-download as fighting the offline requirement). llamafile (Mozilla's own docs say Windows's 4GB EXE cap defeats true single-file bundling, so it degrades to "small launcher + separate GGUF" -- no smaller than the current setup). Raw llama.cpp server sidecar over HTTP (loses native Node bindings and, per the constrained-decoding literature, is a worse ergonomic fit than the in-process GBNF path). BitNet 1.58-bit via bitnet.cpp (~2.2x faster CPU decode, 1/6 the RAM -- but no Node binding, no prebuilt Windows binaries, and loses native GBNF grammar; the team's own doc explicitly scopes it as a Phase-2 evaluation, not a replacement). Electron's own very new `electron/llm` package (too immature to be a credible alternative yet).

**Reasoning:** For this app's actual constraints -- single offline desktop process, medium-end/no-WebGPU hardware, and structured JSON output as "the most valuable AI feature" per the code's own comments -- node-llama-cpp is the correct primary engine, not one leg of arbitrary redundancy. Grammar-constrained decoding (GBNF) is confirmed current 2025-2026 best practice for guaranteed-valid local structured output (constrained decoding masks invalid tokens at the logit level rather than repairing malformed JSON after the fact), and node-llama-cpp is the only one of the app's three inference runtimes that supports it natively. It only runs in the main process (crashes the renderer), which is exactly why the thin-IPC-adapter pattern exists and why the other two runtimes (transformers.js, web-llm) are needed as renderer-side lanes -- so the three-runtime shape is a designed fallback chain, not accidental duplication. Answering the explicit question: node-llama-cpp + transformers.js + web-llm together are NOT simply 2-3x redundant inference overhead here, because each occupies a role the others structurally cannot (main-process/grammar vs renderer-universal-floor vs opt-in WebGPU accelerator) -- see the following two entries for where that reasoning gets thinner.

**Sources:**
  - [node-llama-cpp — Run AI models locally on your machine (official docs)](https://node-llama-cpp.withcat.ai/)
  - [Using Grammar | node-llama-cpp](https://node-llama-cpp.withcat.ai/guide/grammar)
  - [Ollama vs llama.cpp 2026: Which Local LLM Tool Actually Wins?](https://www.kunalganglani.com/blog/ollama-vs-llama-cpp)
  - [Grammar-Constrained Generation: The Output Reliability Technique Most Teams Skip](https://tianpan.co/blog/2026-04-16-grammar-constrained-generation-output-reliability)

### @huggingface/transformers (transformers.js) as the renderer-side offline LLM floor + embeddings runtime — Well-justified

**Current choice:** @huggingface/transformers ^4.2.0, run inside Web Workers only (src/workers/inference.worker.ts, voice-stt-worker.ts, narrator.worker.ts indirectly via kokoro-js), wrapped by src/platform/ai/transformers-engine.ts (1353 lines) with its own WebGPU-adapter detection and WASM fallback. Registered #2 in the provider order (the "guaranteed floor" per registry.ts's own comment). Exclusively owns text embeddings (all-MiniLM-L6-v2) via src/platform/ai/embeddings.ts -> inference-client.ts -> the worker; embeddings.ts explicitly states "@huggingface/transformers is never imported here anymore" because that work moved into the worker.

**Usage evidence:** 8 direct-import files under src/ (embeddings.ts, inference-client.ts, provider/adapters/transformers.ts, transformers-engine.ts, transformers-env.ts, workers/inference.worker.ts, data-formulator/voice-stt-worker.ts, settings/build-info.ts). configureTransformersEnv() hardcodes allowRemoteModels:false (air-gapped by design, no CDN fetch, matches the app's offline-at-runtime constraint). Two on-disk versions exist in node_modules (4.2.0 the app's own pin, 3.8.1 pulled transitively because kokoro-js hard-pins `@huggingface/transformers: ^3.5.1` in its own package.json) -- real but minor duplication from an upstream dependency's peer-range, not a decision this app's team made directly.

**Alternatives:** wllama (llama.cpp compiled to WASM, CPU-only, no WebGPU dependency) is listed as a watched alternative in the team's own tech-radar.md but not adopted. Calling onnxruntime-web directly and hand-rolling tokenization/generation loops (transformers.js already wraps exactly that, so bypassing it would be reinventing its pipeline API for no benefit). Relying on node-llama-cpp for everything is not actually an alternative -- it structurally cannot run in the renderer at all.

**Reasoning:** transformers.js fills two roles neither node-llama-cpp nor web-llm can: (1) it is the only lane that works with zero Electron IPC and zero WebGPU requirement -- the honest floor for the "model not yet downloaded" gap (node-llama-cpp needs the user to fetch a ~1GB GGUF first) and the only lane a hypothetical non-Electron/web build could use; (2) it is the app's sole embeddings runtime, a task the other two runtimes don't serve at all in this codebase's architecture. This is a textbook 2025-2026 "progressive enhancement / graceful-degradation" pattern for offline client-side AI (detect capability, choose the best available backend, degrade gracefully) rather than redundant tooling. The one real inefficiency is upstream, not architectural: kokoro-js forces a second, older transformers.js copy into node_modules via its own peer pin.

**Sources:**
  - [A Guide to In-Browser LLMs (Intel Developer Zone)](https://www.intel.com/content/www/us/en/developer/articles/technical/web-developers-guide-to-in-browser-llms.html)
  - [WebGPU vs WebASM: Browser Inference Benchmarks](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/)
  - [Graceful Degradation Patterns in AI Agent Systems](https://zylos.ai/research/2026-02-20-graceful-degradation-ai-agent-systems/)
  - [Graceful Degradation for AI Agents | 2026 Guide](https://www.buildmvpfast.com/blog/graceful-degradation-ai-agents-fallback-model-unavailable-2026)

### @mlc-ai/web-llm as an opt-in-only WebGPU accelerator — Reconsider

**Current choice:** @mlc-ai/web-llm ^0.2.84, wrapped by src/platform/ai/llm-engine.ts and adapter src/platform/ai/provider/adapters/webllm.ts. Ranked LAST-but-one in registry.ts and explicitly SKIPPED during auto-selection unless `isWebLLMOptIn()` -- the registry comment calls it "DEMOTED: never auto-default, only when a real WebGPU adapter is detected AND the user opts in." src/features/channel-monitor/lib/ai-suggestions.ts documents that its previous direct use was "REJECTED by the tech radar" and was migrated onto the provider registry / llamacpp path.

**Usage evidence:** Only 2 direct call sites left (llm-engine.ts and the webllm adapter); all feature code (insights.ts, nlq.ts, report-ai.ts, ai-suggestions.ts) has been migrated to go through the provider registry rather than importing web-llm directly, per repo grep and the code comments describing that migration as already complete.

**Alternatives:** wllama (llama.cpp-WASM, CPU-only, listed in the team's own tech-radar.md as the alternative in-renderer fallback -- notably CPU-only, so it wouldn't replace web-llm's actual value proposition). Simply retiring web-llm and letting transformers.js's own WebGPU auto-detection (confirmed present in transformers-engine.ts's detectDevice(), which calls navigator.gpu.requestAdapter() and falls back to WASM) serve the same minority of users with a strong GPU.

**Reasoning:** WebGPU reached roughly 70% aggregate browser support by 2026, but with real caveats on exactly the hardware this app targets -- integrated/older GPUs hit missing storage-buffer support and Intel driver hangs, which is precisely why the team already demoted this to explicit opt-in rather than default. The team has done 90% of the right work already (never-default, opt-in gate). What's left unresolved: transformers.js's own onnxruntime-web backend already does WebGPU-with-WASM-fallback in this same codebase (confirmed in transformers-engine.ts), so web-llm's remaining unique value is narrower than "WebGPU support" -- it's MLC's TVM-compiled kernels typically outperforming onnxruntime-web's WebGPU execution provider for LLM decode specifically, which is a real but thin justification for a third ~14MB runtime that's reachable by only the minority of users with a strong discrete GPU who also opt in. This is the one leg of the three-runtime LLM stack worth an explicit team decision (measure the actual throughput delta vs transformers.js-webgpu on a real discrete-GPU box; if it's not decisively better, retiring web-llm removes a maintenance surface for negligible loss) rather than a clear keep-or-cut call either way.

**Sources:**
  - [WebGPU 2026: 70% Browser Support, 15x Performance Gains](https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/)
  - [Browser AI and WebGPU 2026: Running AI Models Locally in Your Browser](https://calmops.com/ai/browser-ai-webgpu-2026-complete-guide/)
  - [A Guide to In-Browser LLMs (Intel Developer Zone)](https://www.intel.com/content/www/us/en/developer/articles/technical/web-developers-guide-to-in-browser-llms.html)

### @langchain/langgraph (+ mandatory peer @langchain/core) for the agent-canvas StateGraph — Well-justified

**Current choice:** @langchain/langgraph ^1.3.6 drives a single real StateGraph in src/features/agent-canvas/core/pipeline.ts (651 lines): 8 nodes, a conditional critique/revise loop (max 3 cycles), a `MemorySaver` checkpointer, and a genuine `interrupt()`/`Command({resume})` human-in-the-loop pause for plan review. @langchain/core is present in package.json solely because it's langgraph's required peerDependency (confirmed via node_modules/@langchain/langgraph/package.json `peerDependencies: {"@langchain/core": "^1.1.48", ...}`) -- there are zero direct `@langchain/core` imports anywhere in src/, so it is not an independent architectural choice.

**Usage evidence:** Single consumer (agent-canvas/core/pipeline.ts), but a deep one: uses Annotation.Root state channels, addConditionalEdges, interrupt/Command resume, and graph.getState() to detect the paused-at-interrupt condition. The code's own header comment documents a prior architectural bug (non-serializable closures inside graph state breaking checkpoint round-trip) that was fixed by moving UI callbacks into a thread-scoped `SINKS` map kept OUT of the annotation -- i.e. this is real, iterated-on framework usage, not a first-draft wrapper.

**Alternatives:** Hand-rolled state machine (e.g. a Zustand/immer reducer, which is how ~20 other stores in this app already manage state) -- would require reimplementing conditional routing, checkpoint snapshotting, and correct interrupt/resume semantics by hand. XState -- a lighter, more general state-machine library, mentioned as a category alternative in current framework comparisons but without langgraph's LLM-agent-specific primitives (interrupt-for-HITL, per-node streaming). Mastra / Vercel AI SDK -- lighter-weight 2025-2026 agent frameworks explicitly positioned against LangGraph for serverless/edge deployments, but that specific selling point (smaller bundle for edge cold-starts) does not transfer to an Electron desktop app, which has no cold-start budget and where the ~5.6MB (deduped, ~12MB with @langchain/core) footprint is trivial next to the app's own multi-hundred-MB GGUF/ONNX model downloads.

**Reasoning:** This is a genuinely deep, load-bearing use of LangGraph's distinctive primitives (cyclic conditional routing, `interrupt()`/`Command({resume})` HITL, checkpointing) for a workflow that has real branching (critique/revise loop) and a real pause-for-human-review point -- past the community-cited "two agents / three branching decisions" break-even point where hand-rolled state machines become the overhead, not the framework. The most commonly cited 2025-2026 objection to LangGraph -- bundle-size overhead hurting edge/serverless cold starts -- explicitly does not apply here: this is a locally-installed Electron app with no cold-start constraint, and the library's few-MB footprint is negligible next to the GB-scale model weights this app already ships. Using an in-memory (non-durable) `MemorySaver` checkpointer is also the correct choice for this app's lifecycle, not a shortcut: a single Electron session doesn't need cross-process-restart durability the way a multi-user server does, so paying for a persistent checkpoint store would be over-engineering in the other direction. @langchain/core is not a separate decision to evaluate -- it's mandatory infrastructure that ships with langgraph regardless.

**Sources:**
  - [LangGraph overview — Docs by LangChain](https://docs.langchain.com/oss/python/langgraph/overview)
  - [LangGraph Multi-Agent Orchestration: Complete Framework Guide + Architecture Analysis 2025](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025)
  - [We Tested 8 LangGraph Alternatives for Scalable Agent Orchestration](https://www.zenml.io/blog/langgraph-alternatives)

### @ag-ui/client + @ag-ui/core protocol packages — Redundant with sibling dependency

**Current choice:** Both listed in package.json (^0.0.54) but zero imports anywhere in src/ or electron/ (confirmed via repo-wide grep for `@ag-ui`, matches only in package.json/pnpm-lock.yaml). Instead, src/features/agent-canvas/core/ag-ui-types.ts hand-rolls the same 16 AG-UI event types itself, with the file's own top comment stating it "mirrors @ag-ui/core spec 2025" rather than importing it, and event-bus.ts / pipeline.ts build and publish those events directly.

**Usage evidence:** `grep -rn "from ['\"]@ag-ui" src/ electron/` returns nothing; `grep -rn "@ag-ui"` across the whole repo (excluding lockfiles) returns nothing either. An older internal planning doc (docs/planning/per-feature-plans.md) describes a data-formulator "AG-UI streaming agent loop" (agent-graph.ts, agui-stream.ts) that no longer exists in the current tree (confirmed via glob/grep -- those files are gone, consistent with the documented Data Formulator rewrite), so even that historical justification is stale.

**Alternatives:** Actually import @ag-ui/client and wire it to the hand-rolled event bus (gets the maintained upstream type definitions and any client-side SSE/transport helpers for free). Delete both packages outright and keep the existing inline reimplementation, since it already does everything the feature currently needs and has been correct in production use (per pipeline.ts's documented bug-fix history). CopilotKit itself (the AG-UI protocol's originating project) is a heavier, React-component-level integration that would be a bigger adoption than this app's current in-house event bus needs.

**Reasoning:** These two packages are pure dead weight in their current state: the actual runtime logic lives entirely in a sibling, hand-rolled module (ag-ui-types.ts + event-bus.ts) that deliberately reimplements the same spec instead of depending on the packages, and nothing in the codebase imports them. AG-UI itself is a legitimate, actively-adopted 2025-2026 protocol (backed by CopilotKit, with LangChain/Google/AWS/Microsoft/Mastra as adopters) for agent-to-frontend event streaming, so the inline reimplementation is defensible as a lighter-weight, dependency-free version of the same idea for a single-process desktop app that doesn't need the client's SSE-transport machinery -- but that argument is a reason to remove the two npm packages, not to keep them installed unused. This is a straightforward prune: delete `@ag-ui/client` and `@ag-ui/core` from package.json, or if the intent is genuinely to standardize on the real client library, replace ag-ui-types.ts with actual imports. Leaving both in package.json while shipping a parallel hand-written implementation is the worst of both options.

**Sources:**
  - [AG-UI Protocol | CopilotKit](https://www.copilotkit.ai/ag-ui)
  - [GitHub - ag-ui-protocol/ag-ui: Bring Agents into Frontend Applications](https://github.com/ag-ui-protocol/ag-ui/)
  - [CopilotKit v1.50 Brings AG-UI Agents Directly Into Your App](https://www.marktechpost.com/2025/12/11/copilotkit-v1-50-brings-ag-ui-agents-directly-into-your-app-with-the-new-useagent-hook/)

### onnxruntime-node (native tabular-ML inference lane) — Right tool, underused

**Current choice:** Declared in package.json (^1.26.0) and actively kept in the Electron packaging pipeline: forge.config.ts's pruneOversizedNativeBinaries() specifically trims it down to just the win32/x64 prebuilt (dropping darwin/linux/win32-arm64), and it's listed in `asarUnpackDirs`. But there are zero `require`/`import` call sites for it anywhere in src/ or electron/ -- everything that touches ONNX in this app runs through the renderer/worker `onnxruntime-web` lane instead.

**Usage evidence:** Confirmed via targeted grep of src/ and electron/ (no hits) plus `knip.json`'s `ignoreDependencies` list, which explicitly whitelists `onnxruntime-node` (alongside `onnxruntime-web`, `@huggingface/transformers`, `sharp`) so the team's own dead-dependency linter doesn't flag it -- i.e. this is a knowingly-unused-for-now dependency, not an oversight. Even after packaging-time pruning to a single platform/arch, the win32/x64 prebuilt alone is ~61MB on disk (unpruned node_modules copy is 218MB across all platforms). Internal docs (docs/planning/v2/tech-radar.md, dependency-catalog.md) describe the intended, not-yet-built feature: "native CPU tabular ML inference (XGBoost/LightGBM/sklearn->ONNX-ML) in main; no 20MB wasm payload" for ai-analysis/deep-analytics/forecast-intelligence/reconciliation.

**Alternatives:** Run the same XGBoost/LightGBM/sklearn-onnx models through the already-wired onnxruntime-web (WASM) lane in a renderer worker instead of adding a second native-in-main lane -- simpler (one runtime instead of two), at the cost of the ~20MB WASM payload and slower native-vs-WASM inference the internal docs cite as the reason to prefer native. Drop the planned feature and the dependency together until it's actually built, re-adding it when the tabular-ML feature is implemented.

**Reasoning:** onnxruntime-node genuinely is the right tool for the stated future goal -- native CPU inference for classical ML models (XGBoost/LightGBM/sklearn) is faster and avoids a WASM payload compared to running the same models through onnxruntime-web, and ONNX Runtime's own docs confirm first-class support for exactly these tabular-model formats plus Electron main-process usage. The problem today is purely that it's paid for (both in install size and in the packaging engineering already spent pruning/unpacking it) without being used at all -- zero call sites, a known-unused entry in the dead-dependency linter's ignore list. For a "medium-end PC" installer-size-conscious app that already spends real engineering effort trimming GBs of native binaries, carrying ~60MB of a currently-inert native module is worth an explicit timeline decision: either land the tabular-ML feature soon (in which case keep it and the current packaging investment is correct) or drop the dependency now and re-add it when the feature actually starts, rather than let "already installed and pruning-configured" substitute for "in use."

**Sources:**
  - [onnxruntime-node — npm](https://www.npmjs.com/package/onnxruntime-node)
  - [Web | onnxruntime (execution providers overview)](https://onnxruntime.ai/docs/tutorials/web/)
  - [GitHub - microsoft/onnxruntime](https://github.com/microsoft/onnxruntime)

### onnxruntime-web as the renderer/worker ONNX execution backend — Well-justified

**Current choice:** ^1.26.0, consumed indirectly through @huggingface/transformers.js as its browser inference backend, plus direct references in src/platform/ai/transformers-env.ts and src/workers/inference.worker.ts for WASM path/threading configuration (self-hosted .wasm, no CDN, per the app's offline requirement).

**Usage evidence:** 2 direct references (transformers-env.ts, inference.worker.ts) plus indirect use as transformers.js's declared backend; internal tech-radar.md calls it "usually transitive" but explicitly "already wired" and instructs self-hosting the simd+threaded .wasm build and pinning `env.backends.onnx.wasm.wasmPaths` -- which transformers-env.ts's configureTransformersEnv() actually does (allowRemoteModels:false, no CDN fetch).

**Alternatives:** None realistic -- it's the standard, Microsoft-maintained WASM/WebGPU execution backend transformers.js itself depends on; the only "alternative" would be transformers.js switching backends upstream, which is outside this app's control.

**Reasoning:** This isn't really a separate architectural decision from choosing transformers.js -- it's transformers.js's execution backend, correctly self-hosted (not CDN-loaded) to satisfy the app's no-internet-at-runtime constraint. The only actionable item found is incidental: three different onnxruntime-web build versions/dev-snapshots are simultaneously present in node_modules (1.22.0-dev, 1.26.0, and a 1.26.0-dev snapshot), most likely because different consumers (transformers.js vs. a sherpa-related dependency) pin slightly different ranges -- worth a `pnpm why onnxruntime-web` pass to see if that can be collapsed to one resolved version, but it's dependency-graph noise, not a wrong technology choice.

**Sources:**
  - [onnxruntime-web — npm](https://www.npmjs.com/package/onnxruntime-web)
  - [Web | onnxruntime](https://onnxruntime.ai/docs/tutorials/web/)

### kokoro-js + sherpa-onnx-node three-tier offline TTS/STT chain — Well-justified

**Current choice:** sherpa-onnx-node (native, Electron main process, electron/voice-service.ts) provides Whisper-tiny STT and Kokoro TTS and is tried FIRST whenever `hasElectronVoice()` is true (src/features/ai-briefing/hooks/useNarrator.ts:129-150, explicit comment: "Prefer the bundled native sherpa-onnx lane"). kokoro-js (renderer Web Worker, narrator.worker.ts / voice-tts-worker.ts, shared loader in src/platform/ai/kokoro-tts.ts) is tried SECOND, only if the native lane is unavailable or throws. `window.speechSynthesis` is the final OS-level fallback.

**Usage evidence:** narrator.worker.ts's own header comment states it is explicitly "a fallback only" behind the native sherpa lane. useNarrator.ts's `speak()` implements the actual 3-way try/catch/fall-through chain (sherpa -> kokoro-js worker -> speechSynthesis) in code, not just in comments. sherpa-onnx-node has a real consumer (electron/voice-service.ts, 396 lines) despite its only other repo footprint being a hand-written `.d.ts` ambient type file -- confirming it's dynamically `import()`-ed at runtime, not dead.

**Alternatives:** Use only sherpa-onnx-node everywhere (drop kokoro-js) -- would remove a fallback tier but breaks in any context where the native binary isn't available (a hypothetical web build, or if the native module fails to load on a given Windows machine). Use only kokoro-js (drop sherpa-onnx-node) -- simpler, one runtime, but gives up the native-binding performance/quality edge the team's own code comments say they prefer, and would lose the already-wired Whisper-tiny STT path (kokoro-js is TTS-only; it has no STT capability, so this option isn't actually equivalent).

**Reasoning:** This looks like duplication at the dependency-list level (two different runtimes both capable of Kokoro TTS) but the code proves it's a deliberate, working tiered-fallback chain identical in spirit to the LLM provider registry pattern used elsewhere in this app -- native-first for quality/performance, browser-worker as a portable fallback, OS synthesis as the zero-dependency last resort. This matches current graceful-degradation best practice for offline-first client AI (detect capability, prefer the best available backend, degrade without breaking the feature). The one genuine, minor issue found is documentation drift, not architecture: useNarrator.ts's own top-of-file comment ("Primary path: the bundled Kokoro-82M neural TTS worker... Fallback: speechSynthesis") omits the sherpa-onnx tier entirely even though the code below it clearly tries sherpa first -- worth a one-line comment fix so the next engineer doesn't misread the intended precedence.

**Sources:**
  - [GitHub - k2-fsa/sherpa-onnx: offline STT/TTS without Internet connection](https://github.com/k2-fsa/sherpa-onnx)
  - [Graceful Degradation Patterns in AI Agent Systems](https://zylos.ai/research/2026-02-20-graceful-degradation-ai-agent-systems/)
  - [Client-Side AI in 2025: Running ML Models Entirely in the Browser](https://medium.com/@sauravgupta2800/client-side-ai-in-2025-what-i-learned-running-ml-models-entirely-in-the-browser-aa12683f457f)

---

## Authentication

_Packages: better-auth, @better-auth/electron, @better-auth/drizzle-adapter_

**Cluster sanity-check:** All three verdicts hold up under repo-level scrutiny and are not generic web-security cargo-culting misapplied to an offline desktop context. For better-auth core: the claim 'no other subsystem consumes the session/user identity' is slightly overclaimed (LanAccessGate derives `isAdmin={Boolean(user)}` from the session, and the topbar shows session.user for display), but this is thin/cosmetic — the LAN pairing system itself (src/platform/lan/pairing.ts, lan-collab.ts) has zero better-auth references and is genuinely independent, and dashboard-access.ts (roles/permissions) is fully independent too (localStorage/drizzle-backed, defaults to 'owner', never reads the session). Stronger evidence found that the researcher didn't cite but that reinforces 'reconsider': the entire Next.js app has exactly one API route — better-auth's own catch-all handler — so the session-cookie machinery has no other server endpoint to protect; its only real job is gating a single RSC page render, which is a lot of machinery (hashed passwords, session tokens, SQLite user/session/account tables, a hardcoded fallback secret) for that. For @better-auth/electron: fetched the official docs directly and confirmed verbatim — 'not suitable for purely local/offline authentication without server infrastructure' and explicitly designed for a 'remote-hosted authentication' flow via the system browser — matching the researcher's paraphrase exactly. Additionally, repo evidence the researcher didn't mention makes this verdict even stronger: ELECTRON_AUTH_SIGN_IN_URL / the electronClient system-browser flow is never triggered from any UI action anywhere in the app (grep found zero call sites outside its own config/test files) — the actual sign-in UI uses a separate plain email/password client. So this isn't just 'architecturally mismatched,' it's wired-up dead infrastructure (custom protocol handler, deep-link CSP allowances) that adds attack surface for a flow nobody can trigger. For safeStorage: confirmed correct and narrowly scoped — fails closed to plaintext when OS encryption is unavailable rather than persisting a weak/unwrapped key, matches the file's own documented safety invariant, no issues found.

### better-auth (core) + @better-auth/drizzle-adapter as the app's local login system — Reconsider

**Current choice:** Full session/cookie-based email+password auth server (better-auth/minimal + nextCookies plugin) running as Next.js API routes (src/app/api/auth/[...all]/route.ts), backed by a local SQLite DB via drizzle (user/session/account/verification tables created in src/platform/auth/auth-database.ts), gating a single-slot lock-screen UI (src/components/auth/os-login.tsx) that stores exactly one `dn.auth.user` in localStorage.

**Usage evidence:** auth.ts (src/platform/auth/auth.ts) wires drizzleAdapter+SQLite; auth-database.ts hand-writes the user/session/account/verification schema and opens it via better-sqlite3 (optionally SQLCipher-encrypted, opt-in). authClient (src/platform/auth/auth-client.ts) is consumed in exactly 3 UI sites: os-login.tsx (signIn.email/signUp.email), topbar.tsx (signOut only), and account-panel.tsx (changePassword + useSession for display). Critically, the app's own authorization model (src/platform/auth/dashboard-access.ts — owner/editor/viewer roles + permissions) reads/writes a separate localStorage key and never consults the better-auth session/user id at all. The LAN multi-device collab feature (src/platform/lan/pairing.ts, src/platform/collab/*) has its own pairing-code scheme and does not use better-auth sessions either. So the entire session/cookie/DB-table machinery exists solely to gate a single local passphrase screen.

**Alternatives:** (1) OS-native unlock: Windows Hello / TouchID / OS user-account boundary — zero extra code, zero extra attack surface, matches how most offline desktop apps rely on the OS login for 'who is this'. (2) Local-vault pattern used by KeePassXC/1Password/Standard Notes local mode: a master passphrase derives an encryption key directly (Argon2/scrypt KDF) that decrypts a local vault file — no session cookies, no server, no 'account' concept, recoverable only via the passphrase itself (explicitly no backdoor/recovery service, by design). (3) A minimal bespoke PIN/passphrase gate backed by Electron's own `safeStorage` (already used correctly elsewhere in this repo for wrapping the auth-DB's SQLCipher key in electron/secure-store.ts) — hash+salt one local credential, unlock a session flag in memory, no HTTP auth server, no cookies, no CSRF surface. (4) Keep better-auth only if the product roadmap genuinely needs its plugin ecosystem (2FA, magic links, real multi-tenant orgs) soon — in which case the current wiring is a reasonable head start, just currently underused.

**Reasoning:** This app has no remote server, no multi-tenant backend, and (confirmed by repo check) no other subsystem consumes better-auth's session/user identity — roles/permissions and LAN pairing are both independently implemented. Running a full password-hashing + session-cookie + SQLite user/session/account/verification-table auth server, embedded in the same single process as the app it's protecting, to implement what is functionally a Windows-lock-screen-style single passphrase gate, is more machinery than the threat model needs: the process boundary IS the trust boundary here (whoever can run the exe already has OS-level access to the machine and its files). It also creates real, currently-unaddressed gaps: better-auth's `emailAndPassword` flow implies a `verification` table for password-reset/email-verification tokens, but this is an offline app with no SMTP/email transport wired up — so a forgotten local password likely has no working recovery path, a problem a local-vault-style design (where the passphrase directly derives the encryption key, with no separate 'reset' flow to break) sidesteps by design. That said, this is not a 'rip it out today' verdict: better-auth is already paid for (dependency, schema, UI) and does provide decent password hygiene (scoring, min length) and a change-password flow that a hand-rolled PIN gate would have to reinvent — so the pragmatic path is to keep it only if multi-account/2FA/real accounts are actually on the roadmap, otherwise collapse it to a lighter local-vault/PIN-plus-safeStorage design and delete the now-unused session/cookie surface.

**Sources:**
  - [Local-first web application architecture](https://plainvanillaweb.com/blog/articles/2025-07-16-local-first-architecture/)
  - [Why Local-First Software Is the Future and its Limitations | RxDB](https://rxdb.info/articles/local-first-future.html)
  - [Lost master password recovery: what works in Bitwarden, 1Password, and KeePassXC — Password Manager Lab](https://passmgrlab.com/posts/lost-master-password-recovery-options/)
  - [Why KeePass instead of self-hosting Bitwarden | Ctrl blog](https://www.ctrl.blog/entry/keepass-vs-bitwarden-server.html)
  - [Better Auth — User & Accounts docs](https://better-auth.com/docs/concepts/users-accounts)
  - [Building an Electron App Offline-First (Local-First Architecture for Privacy Desktop Software)](https://medium.com/@AkiBuilds/building-an-electron-app-offline-first-local-first-architecture-for-privacy-desktop-software-ed32bc7384d9)

### @better-auth/electron (OAuth-style system-browser + custom-protocol deep-link plugin) pointed at the app's own embedded server — Redundant with sibling dependency

**Current choice:** electron/auth-client.ts configures @better-auth/electron's `electronClient` with a custom URI scheme (`com.data-navigator.app://`), a `/auth/callback` path, and `signInURL` pointing at the SAME embedded Next.js server the Electron app itself hosts (baseURL defaults to `http://localhost:3000`). `authClient.setupMain()` is called in electron/main.ts (registers the protocol handler + deep-link listener before app-ready), and electron/main.ts's navigation guard explicitly allowlists the `com.data-navigator.app:` protocol as a valid redirect/navigation target alongside the app's own origin.

**Usage evidence:** electron/auth-client.ts + electron/main.ts (authClient.setupMain, protocol allowlisting in isAllowedNavigation, BETTER_AUTH_TRUSTED_ORIGINS including the custom scheme). But the actual sign-in UX (src/components/auth/os-login.tsx) never invokes the electron-plugin's OAuth/deep-link handshake at all — it calls `authClient.signIn.email()`/`signUp.email()` directly, a plain same-process HTTP call to the embedded server. grep across src/ and electron/ found zero call sites for the plugin's actual sign-in-via-system-browser method; the plugin is imported and its protocol machinery is registered, but the deep-link round trip it exists to support is dead code in this app's real flow.

**Alternatives:** Since there is no separate hosted auth server to redirect out to, the correct-shaped alternative is simply not using this plugin at all: call the local email/password (or local-vault) sign-in directly over the in-process HTTP/IPC channel, as the app already effectively does. If a future 'sign in with your cloud account to enable LAN sync' feature is added, this plugin's system-browser+protocol-callback pattern becomes the right tool at that point (it's the same pattern Auth0/Okta/OneLogin's Electron guides all converge on for that scenario, using PKCE).

**Reasoning:** Better Auth's own Electron integration docs are explicit that this plugin's design assumes 'a remote hosted auth server' reached via 'the system browser' with a PKCE-style authorization-code exchange back through the custom-protocol deep link — i.e., it is built for a desktop app authenticating against a separate cloud SaaS backend, the same shape Auth0/Okta/Descope/OneLogin all describe for Electron OAuth. This repo has no such separate server: the 'server' the protocol would redirect to IS the app's own embedded Next.js instance in the same process. The confirmed 2026 GitHub issue (better-auth/better-auth#7149) shows other developers hitting baseURL/protocol-validation friction from exactly this kind of non-standard (non-http/https, non-remote) usage, i.e., the library is actively fighting configurations like this one. Net effect here: a registered OS-level custom URI scheme, an extra navigation-allowlist branch, and a main-process deep-link listener are all live attack-surface/complexity for a handshake the product's real sign-in path bypasses entirely by calling signIn.email() directly. This is best classified as redundant complexity riding along with the better-auth dependency rather than a deliberate, exercised feature.

**Sources:**
  - [Electron Integration | Better Auth](https://better-auth.com/docs/integrations/electron)
  - [baseURL validation breaks electron custom protocols · Issue #7149 · better-auth/better-auth](https://github.com/better-auth/better-auth/issues/7149)
  - [Origin check blocks Electron apps using `file://` · Issue #7793 · better-auth/better-auth](https://github.com/better-auth/better-auth/issues/7793)
  - [Build and Secure an Electron App - OpenID, OAuth, Node.js, and Express (Auth0)](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/)
  - [Add Auth to an Electron App Using OIDC (Descope)](https://www.descope.com/blog/post/electron-auth-oidc)

### Electron safeStorage (OS keychain, DPAPI on Windows) for wrapping the auth-DB encryption key — Well-justified

**Current choice:** electron/secure-store.ts uses `electron.safeStorage` to encrypt/wrap a 256-bit DEK (data-encryption key) which, when the opt-in `DN_ENCRYPT_AUTH_DB` flag is set, keys a SQLCipher (`better-sqlite3-multiple-ciphers`) connection over the auth SQLite DB (src/platform/auth/auth-database.ts, src/platform/auth/auth-db-encryption.ts). safeStorage is not used to store the user's password/credentials directly, only to protect the DB's own encryption key, and only when the feature is explicitly enabled (default OFF).

**Usage evidence:** electron/secure-store.ts (the only module touching electron.safeStorage per its own doc comment), consumed by electron/main.ts's `ensureAuthDbKeyEnv` call and by auth-database.ts's encrypted-driver path. Confirmed via grep this is the sole safeStorage/keytar/credential touchpoint in the codebase — no keytar dependency exists in package.json.

**Alternatives:** This is already the right tool: Electron's own docs and 2025-era guidance (e.g. Electron-Settings + safeStorage patterns cited in the offline-Electron-auth research above) converge on `safeStorage` — which delegates to OS-native credential protection (DPAPI on Windows, Keychain on macOS, libsecret on Linux) — as the correct way to protect an at-rest secret/key in a desktop app, explicitly so the app never has to hand-roll its own key-wrapping crypto. Using a third-party `keytar` package would be redundant and is in fact deprecated/unmaintained upstream in favor of safeStorage for exactly this reason.

**Reasoning:** For this app's actual constraint — a local DB file that could be copied off a shared/stolen machine — wrapping the DEK in the OS credential store rather than storing it in plaintext next to the DB is the textbook correct move, and the code already does the safer thing of narrowly scoping safeStorage to the one secret that needs OS-backed protection (a machine-bound key) rather than trying to make it carry the whole auth story. The only real critique is scope, not choice of tool: this pattern (passphrase-or-OS-identity unlocking a local encrypted store) is precisely the local-vault architecture that KeePassXC/1Password use, and it would be a more natural foundation for the SIGN-IN gate itself (decision #1) than better-auth's server-shaped session/cookie stack is.

**Sources:**
  - [SafeStorage | Electron](https://www.electronjs.org/docs/latest/api/safe-storage)
  - [offline-first Electron app authentication best practice local account vs OAuth session (search synthesis citing safeStorage + Electron-Settings pattern)](https://medium.com/@raamsri/building-an-electron-app-offline-first-local-first-architecture-for-privacy-desktop-software-ed32bc7384d9)

---

## Real-time collaboration / CRDT stack

_Packages: yjs, y-indexeddb, y-websocket, y-protocols, @hocuspocus/server, @hocuspocus/extension-sqlite, ws, lib0, bonjour-service_

**Cluster sanity-check:** The cluster correctly accounts for the offline/single-user/small-LAN context rather than defaulting to generic cloud-SaaS best practice. The well-justified calls for Yjs (bundle-size vs WASM CRDTs), Awareness (backed by a concrete in-repo bug), and y-indexeddb are all grounded in actual repo evidence, not textbook defaults — reading src/platform/collab/collab.ts confirms the shared doc only holds small JSON-string maps/arrays (filter/tab/mapping/overview/audit), never large blobs, so the OPFS-throughput argument genuinely doesn't apply here. The 'reconsider' on Hocuspocus is also correctly targeted rather than an over-application of minimalism: reading scripts/lan-server.mjs and electron/collab-hub-service.ts side by side confirms both implement the identical y-protocols sync+awareness wire protocol, pairing-code auth, and role-based read-only enforcement — two independently-maintained server implementations of the same relay logic, which is a legitimate proportionality question given the hand-rolled version already proves the team can do this cheaply. I checked whether this hides a worse native-ABI risk (the project has documented better-sqlite3/Electron ABI pain): pnpm-lock.yaml shows @hocuspocus/extension-sqlite's better-sqlite3 dependency dedupes to the exact 12.11.1 version the app's own settings store already requires and already rebuilds for Electron, so there's no new native blast radius — the reconsider verdict doesn't need strengthening on that front, and 'redundant-with-sibling-dependency' would overstate it since Hocuspocus does add genuine incremental value (in-process embedding vs. a separate terminal script, plus durable cross-restart persistence) that the hand-rolled relay lacks. One nuance worth surfacing though not verdict-changing: src/platform/lan/lan-collab.ts shows mDNS auto-discovery is wired only to the Hocuspocus hub path, while the default lan-server.mjs relay still requires manual IP entry — so acting on the Hocuspocus reconsider should also address where bonjour-service's discovery UX ends up, or the app loses zero-config discovery for its default path.

### Yjs as the core CRDT engine — Well-justified

**Current choice:** yjs ^13.6.31 — singleton app Y.Doc (src/platform/collab/collab.ts) + per-room Y.Docs (src/platform/collab/room.ts)

**Usage evidence:** Imported directly in 10 files: src/platform/collab/collab.ts, room.ts, awareness.ts, persistence.ts, collab-hub-doc.ts, src/platform/lan/lan-collab.ts, scripts/lan-server.mjs, plus feature-layer consumers (src/features/collaboration/*). Y.Doc/Y.Map/Y.Array back filter/tab/mapping/overview/presence/audit shared state AND per-room comments/changes/chat/annotations/approvals — it is the load-bearing state substrate for the whole collab-hub + LAN-collab feature, not a peripheral dependency.

**Alternatives:** Automerge (github.com/automerge/automerge, ~6.4k stars, MIT, ~320kB WASM, strong document-history/branching, Ink & Switch-maintained); Loro (github.com/loro-dev/loro, ~5.8k stars, MIT, ~180kB WASM, Rust→WASM, fastest crdt-benchmarks numbers + built-in git-like version history + EphemeralStore presence, 1.0-stable). Verified live via GitHub API on 2026-07-01: yjs 22,099 stars pushed yesterday; loro 5,777 stars pushed yesterday; automerge 6,381 stars pushed yesterday — all three are genuinely actively maintained today, not a 'Yjs vs. abandoned projects' comparison.

**Reasoning:** For this app specifically — offline, single/small-LAN-group, medium-end consumer hardware, WebGPU often absent — the deciding factor is Yjs's pure-JS ~18kB footprint versus Automerge/Loro's 180-320kB WASM payload that must be fetched, compiled, and JIT-warmed on every cold start inside an already-heavy Electron+Next.js process. That is a concrete, hardware-grounded cost on a medium-end PC, not generic SaaS-web advice. Loro's headline advantages (raw throughput, smaller encoded docs, git-like history/branching) target a workload this app doesn't have: the shared docs here are small interactive state (filters, chart config, annotations, chat, approvals), not 260k-edit prose documents, and there is no product requirement for document branching or time-travel. Given Yjs is already the load-bearing substrate across 10+ files and the entire persistence/awareness/LAN stack is built around its API, switching engines would be a full rewrite to buy performance headroom this app doesn't need. Keep Yjs; revisit Loro only if a future feature genuinely needs doc branching or version history (the repo's own internal brief already reaches this same conclusion, and independent verification confirms its factual basis).

**Sources:**
  - [yjs/yjs — GitHub (verified live: 22.1k stars, pushed 2026-06-30)](https://github.com/yjs/yjs)
  - [loro-dev/loro — GitHub (verified live: 5.8k stars, pushed 2026-06-30)](https://github.com/loro-dev/loro)
  - [automerge/automerge — GitHub (verified live: 6.4k stars, pushed 2026-06-30)](https://github.com/automerge/automerge)
  - [dmonad/crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)

### y-protocols Awareness for presence — Well-justified

**Current choice:** y-protocols/awareness ^1.0.7 wired through src/platform/collab/awareness.ts (rAF-throttled cursor writes, 30s auto-prune) and reused across every provider in src/platform/lan/lan-collab.ts

**Usage evidence:** awareness.ts (createAwareness/publishCursor/readPeers/subscribePeers), lan-collab.ts (one shared Awareness instance multiplexed over both the BroadcastChannel and y-websocket providers), scripts/lan-server.mjs (server-side awareness relay + prune-on-disconnect).

**Alternatives:** Hand-rolled heartbeat/prune over BroadcastChannel+localStorage — which is what an earlier version of the collab-hub feature actually shipped, and which the repo's own audit doc (docs/planning/v2/features/collab-hub.md) flags as a real production bug: 'presence uses BroadcastChannel which only spans tabs on the SAME machine — two teammates on two PCs never see each other.' Loro's EphemeralStore is the equivalent primitive if the app ever migrates off Yjs.

**Reasoning:** This is the textbook-correct choice, and uniquely for this app there is direct in-repo evidence that skipping it produced a concrete cross-machine correctness bug (the BroadcastChannel-only presence described above) — not just a style preference. Awareness is network-agnostic (rides whatever provider is active, including a future WebRTC provider, with no extra service to run), auto-prunes ~30s after a stalled peer, and ships versioned with the yjs ecosystem so there is no protocol-compatibility drift to manage separately. The team also correctly declined the unmaintained 'y-presence' React wrapper in favor of a ~30-line hand-written hook, which is the right amount of code for what's needed.

**Sources:**
  - [yjs/y-protocols — GitHub](https://github.com/yjs/y-protocols)
  - [Yjs Docs — Awareness](https://docs.yjs.dev/api/about-awareness)

### y-indexeddb for renderer offline persistence — Well-justified

**Current choice:** y-indexeddb ^9.0.12 via src/platform/collab/persistence.ts — one IndexeddbPersistence per unique doc name, gated on whenSynced before any network provider connects

**Usage evidence:** persistence.ts (attachPersistence/whenStored/clearStoredData/storageEstimate) backs both the singleton app doc (collab.ts, APP_DOC_NAME='collab-app-doc') and every per-room doc (room.ts, PERSIST_PREFIX='dn-room-'); connectRoomLAN and connectLAN both explicitly await local load before opening a network provider (the 'offline ordering invariant').

**Alternatives:** OPFS (Origin Private File System) — higher throughput for large binary state in some 2025-2026 browser-storage writeups, but needs a Worker + manual chunking; a custom Electron-main file/SQLite persistence path (the repo's own internal brief proposes this as an alternative, and better-sqlite3 is already a project dependency for settings, so it would be zero-new-deps).

**Reasoning:** y-indexeddb is the official, lowest-friction Yjs persistence provider, and this app's shared docs (filters, annotations, chat, approvals, audit) are small interactive state, not large binary blobs — so OPFS's throughput edge doesn't apply here and would add code (worker plumbing, manual chunking) for no measurable benefit at this scale. One real caution, confirmed live against the npm registry: the package's last release was 2023-11-02 (~2.5 years stale) though its GitHub repo is not archived and still receives low-volume maintenance (10 open issues, last push 2025-02-12). For a narrow, stable primitive (open/put/get against one IndexedDB table) that is plausible, but it is worth periodically checking it still tracks Chromium's IndexedDB behavior, since Electron's bundled Chromium updates on a much faster cadence than this library releases.

**Sources:**
  - [yjs/y-indexeddb — GitHub (verified live: last push 2025-02-12, latest npm release 2023-11-02)](https://github.com/yjs/y-indexeddb)
  - [Yjs Docs — IndexedDB Database Provider](https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb)

### Hand-rolled ws + lib0 + y-protocols/sync relay (scripts/lan-server.mjs) as the DEFAULT LAN transport — Well-justified

**Current choice:** ws ^8.18.0 + lib0 ^0.2.117 + y-protocols/sync, implementing the Yjs sync/awareness wire protocol directly in a ~500-line Node script. lan-collab.ts's own header comment calls this 'the DEFAULT offline collab path... zero new deps,' and docs/planning/v2/features/collab-hub.md explicitly says to 'keep scripts/lan-server.mjs as the zero-config default.'

**Usage evidence:** scripts/lan-server.mjs is the sole consumer of lib0 and the raw ws server API in the whole repo (0 other files use raw 'ws' or 'lib0'); y-websocket's WebsocketProvider (client side) is the lazy-imported browser counterpart in room.ts and lan-collab.ts.

**Alternatives:** @y/websocket-server (github.com/yjs/y-websocket-server) — the official reference relay server that y-websocket itself extracted into a separate forkable repo; y-redis (scale-out backend, wrong shape — this app has no horizontal-scaling need); y-sweet (Rust, S3-backed persistence, wrong shape — no S3 here).

**Reasoning:** This is the strongest evidence in the whole cluster that the team already understands proportionality: the hand-rolled relay mirrors the Yjs project's own reference minimal-server pattern (relay MSG_SYNC/MSG_AWARENESS frames only, in-memory Map of rooms) almost message-for-message — it isn't risky reinvention, it's following the documented reference implementation inline instead of depending on the separate y-websocket-server package. For a trusted, few-peer LAN room this is exactly proportionate: no auth framework, no horizontal scaling, no multi-tenant document routing beyond a Map keyed by room name — nothing more than the actual collaboration surface needs. It also adds hardening the generic reference implementation lacks: a CSPRNG pairing code (crypto.randomInt, not Math.random), constant-time pairing-code comparison (crypto.timingSafeEqual), a localhost-only default HOST, capped maxPayload, and perMessageDeflate disabled (per current WebSocket DoS/compression-amplification guidance). This file is the proof that 'proportionate machinery' for this use case is achievable in ~500 lines with zero extra framework dependencies.

**Sources:**
  - [yjs/y-websocket-server — GitHub (official reference relay)](https://github.com/yjs/y-websocket-server)
  - [yjs/y-websocket — GitHub](https://github.com/yjs/y-websocket)
  - [Yjs Docs — y-websocket connection provider](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket)

### @hocuspocus/server + @hocuspocus/extension-sqlite as the optional embedded LAN hub — Reconsider

**Current choice:** Lazy-imported only inside electron/collab-hub-service.ts, started on demand via IPC (window.electronCollab.start), never loaded unless a user explicitly launches the in-app hub

**Usage evidence:** Exactly 1 source file in the repo imports @hocuspocus/server / @hocuspocus/extension-sqlite. The repo's own planning docs disagree on its intended role: docs/planning/v2/dependency-catalog.md states it 'Replaces hand-rolled lan-server.mjs,' while the later, more detailed docs/planning/v2/features/collab-hub.md calls it 'Trial,' 'OPTIONAL,' and instructs to 'keep lan-server.mjs as default' — the decision was never fully closed out, and in shipped code it landed as a second, parallel, always-optional hub rather than a replacement.

**Alternatives:** No new library is actually required: the same protocol logic already hand-written for scripts/lan-server.mjs (previous decision) could run inside Electron main as a function call instead of a spawned script, giving the two genuine UX wins (no separate terminal, a persisted log) without a second framework and a second onAuthenticate/onListen lifecycle to audit. If server-side persistence is still wanted, @hocuspocus/extension-database (thinner, no bundled SQLite driver) is a lighter middle ground than @hocuspocus/extension-sqlite.

**Reasoning:** This is the direct answer to the cluster's central question: Hocuspocus's actual design target — per its own docs/GitHub description ('Yjs CRDT WebSocket backend...TipTap, ProseMirror, Yjs-based whiteboards'), multi-runtime support (Node/Bun/Deno/Cloudflare Workers), auth-provider hooks, webhook extensions, and a Redis horizontal-scaling extension — is a cloud-hosted collaborative-document-editor backend serving many concurrent users and documents. None of that matches this app's actual surface: one trusted LAN, a handful of named peers, a pairing code. The one feature Hocuspocus is specifically built to provide beyond the hand-rolled relay is server-side SQLite persistence of a canonical document — but this app has no canonical server document: every peer already keeps a complete, durable replica via y-indexeddb (see that decision above), and Yjs's whole design point is that any peer can fully re-sync any other peer from its own local state. So Hocuspocus's headline capability (protect a single point of truth from loss) is solving a problem this peer-replicated, offline-first architecture doesn't have. The genuine wins it delivers here — one-click start with no separate terminal, and an inspectable SQLite log — are real but don't require adopting a second server framework with a second attack surface: this app's own operational history already shows the LAN hub's pairing-code/auth handling is a security-sensitive area needing careful review (fail-closed constant-time pairing checks, no code leakage), and running two independently-implemented authentication paths (lan-server.mjs's safeCodeEqual vs. collab-hub-service.ts's onAuthenticate/pairingCodesMatch) doubles that review burden for the same net capability. Because it is lazy-imported, opt-in, and confined to one file, the runtime/bundle cost today is low, so this is not urgent — but it is architecturally heavier machinery than the actual few-peer LAN collaboration surface needs, and the unresolved 'replace vs. trial' framing between the two planning docs suggests this should be explicitly decided: either give Hocuspocus a concrete capability only it can provide and document why two servers are worth maintaining, or fold its two real UX benefits into the existing hand-rolled relay and drop the two extra dependencies.

**Sources:**
  - [ueberdosis/hocuspocus — GitHub (verified live: 2.5k stars, pushed 2026-06-26, v4.3.0 released 2026-06-18)](https://github.com/ueberdosis/hocuspocus)
  - [Hocuspocus | Tiptap Collaboration Docs — Introduction](https://tiptap.dev/docs/hocuspocus/introduction)
  - [Show HN: Hocuspocus 4 – self-hosted Yjs collaboration backend](https://news.ycombinator.com/item?id=48208834)
  - [Y-redis: An alternative backend to y-websocket — Yjs Community (context on why alternate Yjs backends exist: scale, not LAN)](https://discuss.yjs.dev/t/y-redis-an-alternative-backend-to-y-websocket/2509)

### bonjour-service for mDNS LAN discovery — Right tool, underused

**Current choice:** bonjour-service ^1.4.1, used only inside electron/collab-hub-service.ts (publish/find), gated entirely behind the optional Hocuspocus hub

**Usage evidence:** 3 files reference bonjour (electron/collab-hub-service.ts plus the discoverHubs/subscribeHubDiscovery type consumers in lan-collab.ts). The DEFAULT lan-server.mjs path has zero mDNS wiring: users on that path rely on manually typing an IP or on lan-collab.ts's scanLANSubnet, which HTTP-probes up to 254 hosts in batches of 24 with a 450ms timeout each.

**Alternatives:** node-dns-sd (github.com/futomi/node-dns-sd, pure-JS, MIT, similar scope); node-mdns / libp2p-mdns (native-compiled — current 2025-2026 discussion of Electron native-module packaging confirms these require electron-rebuild and commonly break when an app is moved to a machine without the build toolchain).

**Reasoning:** Choosing a pure-JS mDNS library over any native-binding implementation is clearly the correct call for this specific app: it already has a documented history of native-module ABI pain in this exact Electron main process (better-sqlite3's NODE_MODULE_VERSION mismatch against Electron's bundled Node), so deliberately avoiding a second native dependency for LAN discovery is a reasoned, app-specific decision, not generic advice. bonjour-service itself is current and maintained — verified live: GitHub push 2026-06-24, npm 1.4.2 released the same week. The actual gap is architectural placement, not the library choice: mDNS advertise/discover has nothing intrinsically to do with Hocuspocus — bonjour-service is a standalone Node package (raw UDP sockets) that could run from Electron main independent of which relay is active. As wired today, only users who opt into the heavier Hocuspocus hub get zero-typing auto-discovery; users on the 'zero-config default' path (lan-server.mjs, which the repo's own docs frame as what most users will actually run) are stuck typing an IP or waiting on the slower batched subnet scan. Decoupling bonjour-service from collab-hub-service.ts so it can advertise/discover for either relay would deliver the same discovery UX to the default path without requiring anyone to adopt Hocuspocus at all — and would remove one of the stated reasons (§4.9 of docs/planning/v2/features/collab-hub.md) for keeping Hocuspocus in the previous decision.

**Sources:**
  - [onlxltd/bonjour-service — GitHub (verified live: pushed 2026-06-24)](https://github.com/onlxltd/bonjour-service)
  - [Using Native Node Modules | Electron Docs](https://www.electronjs.org/docs/tutorial/using-native-node-modules)
  - [futomi/node-dns-sd — GitHub (pure-JS alternative)](https://github.com/futomi/node-dns-sd)

---

## WAF / security middleware

_Packages: @coraza/core, @coraza/coreruleset, @coraza/next, easy-waf, rate-limiter-flexible, ipaddr.js_

**Cluster sanity-check:** The researcher correctly grounded this in the app's actual architecture rather than generic web best practice: I verified the embedded Next server is loopback-enforced (electron/security.ts assertLoopbackHostname), proxy.ts's Host-header allowlist runs before Coraza and does defeat DNS-rebinding, the CSRF sec-fetch-site check covers state-changing requests, and — importantly — the only HTTP-reachable route is the better-auth [...all] handler (no CSV/data API routes exist server-side; DuckDB runs renderer-side). LAN collaboration runs a fully separate WebSocket service on port 1234 (Hocuspocus) that never touches proxy.ts/Coraza at all, so the WAF's real-world exposure is even narrower than "reconsider" implies. easy-waf and ipaddr.js verdicts are also confirmed correct by grep (zero references anywhere in source for either; ipaddr.js has a genuine unwired use-case in electron/collab-hub-service.ts's manual `/^\d+\.\d+\.\d+\.\d+$/` IPv4 parsing). The one place the researcher under-researched: rate-limiter-flexible's "redundant" verdict only rebuts the login-brute-force use case via better-auth, but the codebase's own docs/security/localhost-hardening-catalog.md lists still-open, CRITICAL/HIGH-priority rate-limiting needs that better-auth's HTTP-scoped limiter cannot cover — LAN pairing-code brute-force lockout (item 220, tagged APPLYING-NOW/CRITICAL), IPC channel flood protection (item 27), and LAN relay per-connection message throttling (item 118) — none of which have any hand-rolled implementation today. That's the same "dead now, plausible near-term wiring" pattern the researcher already applied to ipaddr.js, just missed for this package.

### Coraza + OWASP CRS in-process WAF (@coraza/core, @coraza/coreruleset, @coraza/next) in src/proxy.ts — Reconsider

**Current choice:** A WASM-based, ModSecurity-compatible WAF (Coraza) running the OWASP Core Rule Set in 'block' mode, invoked as Next.js proxy middleware on every non-static request, inspecting URL+headers+method+body for SQLi/XSS/LFI/RFI/RCE signatures, fail-closed (503) on WAF init/runtime failure.

**Usage evidence:** Actively wired, not vestigial: src/proxy.ts imports createWAF/consoleLogger from @coraza/core, recommended() from @coraza/coreruleset, createCorazaRunner/defaultBlock from @coraza/next, and runs it as step 3 of every request in config.matcher (all paths except _next/static, _next/image, hmr, favicon). Backed by a dedicated policy module (src/platform/security/waf-policy.ts, 133 lines) with its own unit test (tests/security/waf-policy.test.ts). The module's own comments document a real production incident it caused and the team fixed: default CRS rules 911100/920420 blocked every application/json auth POST until explicitly excluded — proof this is live and consequential, not decorative. knip does not flag it as unused (unlike the three packages below).

**Alternatives:** (1) coraza-node — the same Coraza maintainer's newer, more 'npm-native' WASM connector for plain Node (no proxy/sidecar layer), essentially the same architecture this app already has via @coraza/next, itself still preview-stage. (2) Sidecar/reverse-proxy WAF deployment (Traefik/Caddy/ngrok Coraza-wasm plugins, or ModSecurity) — not applicable here since there is no separate network tier in front of this app to put a sidecar in. (3) Drop the generic pattern-matching WAF and instead fix the actual root cause: harden the dynamic DuckDB SQL construction the app performs for pivots/filters/columns (confirmed present in src/features/telecom/lib/sql.ts, src/features/data-transform/engine/sql.ts, src/core/queries/duckdb.ts, src/platform/duckdb/pushdown.ts and ~15 more files) with identifier allowlisting/quoting, and keep relying on the Host-header allowlist + Sec-Fetch-Site CSRF check + CSP that already run independently of Coraza in the same file.

**Reasoning:** This app's own code already closes the threat model a WAF is usually sold against: the embedded Next server binds loopback-only and is enforced as such (electron/security.ts assertLoopbackHostname), and proxy.ts's own Host-header allowlist (step 1, before Coraza runs) is the textbook, complete mitigation for DNS-rebinding-style attacks against local servers — the exact attack class that hit Ollama, another local-loopback desktop-AI server (CVE-2024-28224, NCC Group). CSRF is separately handled by the Sec-Fetch-Site check, and XSS-via-remote-script is separately handled by the renderer CSP. So an 'internet attacker reaches the port' or 'malicious website rebinds DNS' threat model — the classic reason to run OWASP CRS — genuinely does not apply here and is already defended by cheaper, more precise controls that exist regardless of Coraza. Where Coraza does add real, non-theatrical value is a narrower scenario this codebase actually has surface for: this app builds a substantial amount of dynamic/interpolated SQL for its DuckDB analytics engine (dynamic column/filter construction across 15+ files) where full parameterization is impractical because SQL bind params can't cover identifiers — and the project's own coverage-audit memory records a real 'SQL single-quote-escape' bug found in this exact area. In that light, Coraza is a legitimate compensating control against a compromised-or-XSS'd renderer (or a supply-chain-compromised transitive dependency) issuing same-origin, Host-allowlist-passing, CSRF-check-passing requests that try to exploit that dynamic SQL. That's a real, app-specific justification — but it is a narrower and more indirect one than 'defend the API', and the correct durable fix for that risk is hardening identifier handling in the SQL builder, not a generic HTTP body scanner. Given the user's own stated architectural direction elsewhere in this codebase ('security tooling in dev/CI, not runtime'; preferring lean in-process solutions like selfsigned TLS over bundling nginx/Caddy) and the fact that all three @coraza/* packages are pre-1.0 previews embedded in the hot path of every request on a resource-constrained medium-end desktop PC — with a fail-closed 503 behavior that, for a single-user app with no ops team, means a WASM regression silently locks the user out rather than degrading gracefully — proportionality is genuinely debatable rather than clear-cut. Recommendation: keep it as an explicit, temporary compensating control tied to the dynamic-SQL risk, but track hardening the SQL builder as the actual fix, and re-evaluate whether the full multi-family CRS ruleset (XSS/LFI/RFI/RCE, not just SQLi) is still earning its complexity/resource cost once that's done — this is not obviously permanent architecture.

**Sources:**
  - [Coraza — OWASP Coraza WAF (Go, ModSecurity-compatible, OWASP CRS)](https://github.com/corazawaf/coraza)
  - [Node.js finally gets a real WAF — and it runs inside your process (coraza-node, preview)](https://medium.com/@jptosso/node-js-finally-gets-a-real-waf-and-it-runs-inside-your-process-ed075518e947)
  - [OWASP CRS Project](https://owasp.org/www-project-modsecurity-core-rule-set/)
  - [Electron Security tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
  - [DNS rebinding attacks explained — GitHub Security Blog](https://github.blog/security/application-security/dns-rebinding-attacks-explained-the-lookup-is-coming-from-inside-the-house/)
  - [Technical Advisory – Ollama DNS Rebinding Attack (CVE-2024-28224) — NCC Group](https://www.nccgroup.com/research-blog/technical-advisory-ollama-dns-rebinding-attack-cve-2024-28224/)

### easy-waf (secondary Node WAF library) — Redundant with sibling dependency

**Current choice:** Listed as a runtime dependency (^0.6.0) alongside the fully-wired Coraza stack.

**Usage evidence:** Zero imports anywhere in src/, electron/, or tests/ — grep for 'easy-waf' across the repo only matches package.json and pnpm-lock.yaml. Confirmed dead by `npx knip --dependencies`, which reports `easy-waf package.json:154:6` as an unused dependency; it is not present in knip.json's ignoreDependencies allowlist (unlike @huggingface/transformers, onnxruntime-web/node, sharp, which are deliberately allowlisted for known indirect-usage reasons). git blame shows it was added in the same bulk dependency-declaration commit as several other now-unused packages.

**Alternatives:** easy-waf itself (per its own README and Socket.dev's analysis) is explicitly positioned as 'more an educational tool than a professional security solution' with irregular release cadence — i.e. even on its own terms it isn't a credible alternative to the OWASP-CRS-backed Coraza stack that is actually deployed. There is no reason to run two WAF libraries in one app; the only real alternatives here are 'keep Coraza, delete this' or 'keep this, delete Coraza' — and Coraza is the one with test coverage, a documented incident/fix history, and OWASP CRS parity, so it is the correct one to keep.

**Reasoning:** This is dead weight sitting next to the sibling WAF (Coraza) that is actually doing the job. It adds install size, a second security-relevant supply-chain dependency to audit, and cognitive overhead ('why do we have two WAF packages?') for zero runtime benefit — it is not imported, not wired into proxy.ts or anywhere else, and knip independently confirms it. There is no proportionality question to debate here since it does nothing; the only decision is removal. Recommend deleting it from package.json in the same change as any other dependency cleanup.

**Sources:**
  - [easy-waf — GitHub (timokoessler/easy-waf)](https://github.com/timokoessler/easy-waf)
  - [easy-waf — npm Package Security Analysis, Socket.dev](https://socket.dev/npm/package/easy-waf)

### rate-limiter-flexible (application-level rate limiting) — Reconsider

**Current choice:** Listed as a runtime dependency (^11.2.0); no rate-limiting code exists anywhere in the app.

**Usage evidence:** Zero imports in src/, electron/, or tests/ — grep for 'rate-limiter-flexible' and 'rate.?limit'/'RateLimiter' (case-insensitive) across src/ returns no matches. `npx knip --dependencies` reports `rate-limiter-flexible package.json:197:6` as unused. src/platform/auth/auth.ts (the better-auth config) has no rateLimit block, meaning the app relies entirely on better-auth's own built-in defaults rather than this library.

**Alternatives:** better-auth (already a direct dependency, already the app's auth layer) ships its own built-in IP-based rate limiter, on by default in production, off in dev, with per-route override support and IPv6-normalization to prevent bypass — i.e. the one genuinely sensitive endpoint this app has (login/auth brute force) is already covered without rate-limiter-flexible. For a true multi-tenant server, rate-limiter-flexible (Redis/Mongo-backed, distributed) would be the standard heavyweight choice, but that use case (coordinating limits across multiple processes/machines) doesn't exist in a single-process, single-user, offline desktop app with one local caller.

**Reasoning:** Doubly unjustified: it's unused dead code by knip's own report, AND the capability it would provide (login brute-force throttling) is already redundantly covered by better-auth's built-in rate limiter, which needs no extra dependency and is already present in the request path (src/app/api/auth/[...all]/route.ts). rate-limiter-flexible's actual design center — cross-process/distributed request throttling via Redis/Mongo stores — has no application in a single-user offline Electron app with no concurrent tenants and no distributed deployment. There's no proportionality debate to have here either; it should be removed unless there's a concrete near-term plan to rate-limit some other endpoint that better-auth doesn't cover (e.g. a future LAN-collaboration API), in which case the lighter move is a few lines of in-memory token-bucket code, not a distributed-systems rate-limiting library.

> **Verify override:** was "Redundant with sibling dependency", changed to "Reconsider" — The 'redundant with better-auth' rebuttal only covers HTTP login brute-force. It misses that docs/security/localhost-hardening-catalog.md documents still-open, CRITICAL/HIGH-priority rate-limiting gaps this dependency is the right tool for and better-auth cannot reach: LAN pairing-code brute-force lockout (item 220, tagged APPLYING-NOW/CRITICAL, confirmed unimplemented in electron/collab-pairing.ts), IPC channel flood protection (item 27), and LAN relay per-connection message throttling (item 118, separate Hocuspocus WS server on port 1234). Same 'dead now but genuine near-term plan exists' pattern the researcher correctly applied to ipaddr.js — should get the same verdict: remove now or wire up against those documented TODOs, not dismissed as strictly redundant.

**Sources:**
  - [rate-limiter-flexible — npm](https://www.npmjs.com/package/rate-limiter-flexible)
  - [Better Auth — Rate Limit concept docs](https://better-auth.com/docs/concepts/rate-limit)
  - [Better Auth — Security reference docs](https://better-auth.com/docs/reference/security)

### ipaddr.js (IP address parsing/validation) — Reconsider

**Current choice:** Listed as a runtime dependency (^2.4.0); not imported anywhere.

**Usage evidence:** Zero imports of the package in src/ or electron/. The only text match for 'ipaddr' in the source tree is src/db/schema.ts:28 (`ipAddress: text("ip_address")`), which is an unrelated database column name, not a reference to the ipaddr.js package. `npx knip --dependencies` reports `ipaddr.js package.json:171:6` as unused. The app's actual loopback/origin validation logic (electron/security.ts: isAllowedAppOrigin, isLoopbackHostname, ALLOWED_HOSTS in proxy.ts) is hand-rolled with plain string/URL comparisons and never touches ipaddr.js.

**Alternatives:** Node's built-in `net.isIP()`/`new URL()` (already what electron/security.ts and proxy.ts actually use) fully cover this app's current needs (loopback-hostname checks, Host-header allowlisting) without a dependency. ipaddr.js earns its keep specifically for CIDR-range matching and IPv4/IPv6 canonicalization/normalization (e.g. collapsing IPv6 representations of the same address to prevent allowlist-bypass) — which is exactly the kind of check the LAN-collaboration peer-discovery feature referenced in electron/security.ts's CSP comments (`ws:`/`wss:` connect-src for 'LAN collaboration peers... any host:port') would plausibly need if/when peer IPs are validated against a subnet allowlist.

**Reasoning:** This is a clean, low-risk case of a dependency added ahead of need and never wired up — confirmed dead code, not a proportionality question. It should either be removed now, or — if the LAN-collaboration peer-discovery feature genuinely has near-term plans to validate peer IPs/subnets (which would be a legitimate, non-trivial thing to hand-roll correctly, especially IPv6 canonicalization to avoid allowlist-bypass bugs) — kept deliberately with a comment/TODO tying it to that feature so it doesn't look like accidental cruft. Given this app's LAN-collaboration surface is a real, if secondary, network attack surface (unlike the fully loopback-isolated main server), this is the one dependency in the cluster where 'keep it for a concrete near-future use' is plausible rather than pure waste — but that should be confirmed with whoever owns the collaboration feature rather than assumed.

**Sources:**
  - [ipaddr.js — npm](https://www.npmjs.com/package/ipaddr.js)
  - [Knip — unused dependencies detection](https://knip.dev/)

---

## Charting / data visualization

_Packages: echarts, echarts-for-react, echarts-wordcloud, recharts, deck.gl, vega, vega-lite, react-vega, uplot, wordcloud2, canvas-confetti, react-confetti-boom_

**Cluster sanity-check:** The researcher correctly grounded the analysis in the offline/single-process/single-user-or-small-LAN Electron reality rather than generic web-app best practice: it explicitly rejected the usual 'load a second lib lazily, browsers cache it across sites' CDN-caching justification (which doesn't apply here), and it correctly treated 'no server to offload to' as a reason bundle size/main-thread contention matter more, not less. I verified empirically against the actual source tree (grep for imports of recharts, deck.gl/@geoarrow, vega/vega-lite/react-vega, echarts-wordcloud, react-confetti-boom): all five are confirmed dead — zero non-comment imports anywhere in src, with in-repo comments explicitly documenting that each was tried/scaffolded and then superseded (chart.tsx shadcn wrapper has zero consumers; MapLibreMap/OfflineMap comments say deck.gl was deliberately avoided; WordCloudScene comment says echarts-wordcloud was 'the previous implementation'; AchievementSystem/Celebrate comments say react-confetti-boom is 'gone'/'former'). So the four 'redundant-with-sibling-dependency' verdicts (recharts, deck.gl, vega stack, echarts-wordcloud) are correct and if anything understated — these aren't just architecturally redundant, they're literally unreferenced dependencies inflating install size and audit surface. The one miscalibration is the canvas-confetti/react-confetti-boom row: it was graded 'well-justified' as if it were a live, deliberate two-library split (like uplot+echarts), but react-confetti-boom is empirically in the exact same 'retired, zero imports, package.json never pruned' state as echarts-wordcloud, which got the opposite label for the identical pattern. ECharts-as-primary and uPlot-for-hot-path-forecasts both check out against actual usage (echarts imported in 20+ files; uplot only in the two ForecastChart components + shared uplot-config, a genuine narrow perf-critical carve-out) and their offline/no-CDN-caching reasoning is sound.

### ECharts (tree-shaken core) as primary chart engine — Well-justified

**Current choice:** echarts + echarts-for-react, consumed only through src/platform/viz/echarts-core.ts which imports from echarts/core plus explicitly registered chart/component/renderer modules (Bar/Line/Pie/Scatter/Heatmap/Sankey/Sunburst/Custom + Grid/Tooltip/Legend/Title/VisualMap/DataZoom/Calendar/MarkLine + Canvas/SVG renderers), cutting bundle from ~1MB to ~150-400KB with one shared registry.

**Usage evidence:** Genuinely load-bearing and dominant: 62 files under src/features/** import echarts, echarts-for-react, or platform/viz (agent-canvas, ai-analysis, ai-briefing, analytics-theater, channel-monitor, data-browser, data-formulator, data-transform, deep-analytics, folders, forecast-intelligence, dashboard-shell, csv-parser, collaboration, and more). It is the default engine for essentially every chart type in the app except the two hot-path forecast line charts.

**Alternatives:** Recharts (SVG, React-idiomatic API, but each point is a DOM node so it stutters past roughly 1,000 points / 5 updates-per-second); Nivo (SVG+Canvas+WebGL hybrid, strong for presentation-polish static charts, thinner ecosystem for dense interactive dashboards); Chart.js/react-chartjs-2 (simple Canvas API, far fewer chart types, weaker large-dataset story than ECharts); visx (low-level D3+React primitives, more hand-rolled code for equivalent functionality).

**Reasoning:** This is a single offline Electron renderer process drawing dense telecom CDR analytics (heatmaps, sankeys, calendar charts, drill-downs) on medium-end consumer PCs, with no server to offload rendering to and no benefit from lazy-loading a second heavy lib 'for free' via CDN caching. Bundle size and CPU/GPU cost inside the renderer translate directly into perceived responsiveness. Current 2025-2026 guidance consistently ranks ECharts above Recharts/Nivo for large, frequently-updated Canvas-rendered datasets (100k+ points, sub-100ms interaction), which matches this app's actual chart mix across 62 call sites. The team already did the correct optimization: tree-shaken echarts/core with one shared module registry (avoiding the split-registry blank-chart bug) instead of the ~1MB full build. This is the right default engine for this constrained environment and is used broadly, not speculatively.

**Sources:**
  - [Best React chart libraries in 2026: Features, performance, and use cases - LogRocket Blog](https://blog.logrocket.com/best-react-chart-libraries-2026/)
  - [Choosing a React Chart Library: Recharts vs. ECharts vs. Nivo vs. Lightweight Charts](https://chenguangliang.com/en/posts/blog152_react-chart-libraries-comparison/)
  - [Comparing 8 Popular React Charting Libraries — Performance, Features, and Use Cases](https://medium.com/@ponshriharini/comparing-8-popular-react-charting-libraries-performance-features-and-use-cases-cc178d80b3ba)
  - [Features - Apache ECharts](https://echarts.apache.org/en/feature.html)

### uPlot for hot-path forecast line/band/anomaly charts — Well-justified

**Current choice:** uplot (~38-50KB, Canvas 2D, no worker) used directly for the forecast_intelligence and ai-analysis ForecastChart components, plus a shared wrapper in src/platform/viz/use-uplot.ts and src/platform/viz/uplot-config.ts (toAlignedData, useUPlot).

**Usage evidence:** Deliberately scoped, not accidental duplication: src/features/forecast-intelligence/components/ForecastChart.tsx and src/features/ai-analysis/components/ForecastChart.tsx both carry explicit code comments explaining this REPLACED an ECharts line/band/anomaly chart because uPlot draws dense time-series at roughly 10% of the CPU and 12MB vs ECharts' 70%/85MB on this specific most-rendered surface (re-renders on every horizon toggle), while ECharts is explicitly kept for heatmap/scatter/gauge/pie tabs elsewhere.

**Alternatives:** Keeping ECharts everywhere (simpler mental model, one dependency, but the code comments and public benchmarks confirm a real CPU/memory penalty on this specific hot path); Lightweight Charts (TradingView's canvas lib, optimized for financial OHLC but narrower general-purpose API); WebGL-based libs (uPlot's own docs note WebGL is the next tier up for massive streaming/60fps signal data, which this forecast surface does not need).

**Reasoning:** This is a genuine right-tool-for-the-job split, not redundant overlap: 2025-2026 benchmarks show uPlot rendering 150k+ points in ~58-65ms vs ECharts' ~88-114ms at roughly 1/20th the bundle size, and the in-repo comments show the team measured this specific component (re-renders on every horizon toggle) before making the swap, then explicitly kept ECharts for the chart types where it has no disadvantage. On a medium-end PC with no GPU headroom to spare and an offline LLM/DuckDB competing for the same CPU, shaving 60 percentage points of CPU off the most-rendered widget is a legitimate, evidence-based optimization rather than dependency sprawl. The scope is narrow (2 forecast components + a small shared hook/config module), which keeps the added-library cost proportionate to the benefit.

**Sources:**
  - [GitHub - leeoniya/uPlot: A small, fast chart for time series, lines, areas, ohlc & bars](https://github.com/leeoniya/uPlot)
  - [Performance Comparison of JavaScript Chart Libraries in 2026 - SciChart](https://www.scichart.com/blog/chart-bench-compare-javascript-chart-libraries/)
  - [My Thoughts on the uPlot Charting Library - Casey Primozic's Notes](https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/)

### Recharts (shadcn chart.tsx wrapper) — Redundant with sibling dependency

**Current choice:** recharts is a package.json dependency with a full shadcn ChartContainer/ChartTooltip/ChartLegend wrapper in src/components/ui/chart.tsx, but that file is never imported by any other file in the codebase.

**Usage evidence:** Confirmed dead: `grep` for ChartContainer/ChartTooltip/ChartLegend/RechartsPrimitive across src turns up only the definition file itself, zero consumers. Independently confirmed by the project's own `knip` dead-code scan (pnpm run check:deadcode), which lists `recharts` under 'Unused dependencies'. It is leftover shadcn/ui scaffolding that was never wired into a feature screen.

**Alternatives:** N/A for a decision going forward — the only real alternatives here are 'delete it' or 'actually use it for something ECharts/uPlot don't already cover' (neither is currently true; ECharts already covers the same chart-type surface Recharts/shadcn charts would provide).

**Reasoning:** This is pure repo hygiene, not a live architectural decision: recharts adds a full second charting engine's worth of install size, security-audit surface, and 'which chart lib do I use' ambiguity for developers, while contributing zero runtime value — every chart type it could render is already covered by the tree-shaken ECharts core actually wired into features. In an offline single-user desktop app there's no elasticity benefit to keeping an unused SDK 'just in case'; it only costs install time, node_modules size, and knip/audit noise. Recommendation: delete src/components/ui/chart.tsx and remove `recharts` from package.json, or if shadcn chart primitives are wanted later, re-add them deliberately when a concrete screen needs them.

**Sources:**
  - [Unused dependencies - Knip](https://knip.dev/typescript/unused-dependencies)
  - [The Complete Guide to Finding and Removing Unused Dependencies in Your Project](https://medium.com/@ittarek551/the-complete-guide-to-finding-and-removing-unused-dependencies-in-your-project-2cd8aa4643c9)

### deck.gl / @geoarrow/deck.gl-layers for geo visualization — Redundant with sibling dependency

**Current choice:** deck.gl and @geoarrow/deck.gl-layers are package.json dependencies, but geo-analysis actually renders maps via maplibre-gl native GeoJSON circle layers (MapLibreMap.tsx) or a hand-rolled offline Canvas2D scatter map (OfflineMap.tsx) with zero deck.gl imports anywhere in src/electron/scripts.

**Usage evidence:** Confirmed dead by direct search (`from 'deck.gl'` / `from '@deck.gl` / `from '@geoarrow'` = zero hits in src) and by knip's unused-dependency report, which lists both `deck.gl` and `@geoarrow/deck.gl-layers`. The in-repo code comments are explicit about this: MapLibreMap.tsx states region aggregates are rendered as a native MapLibre GeoJSON circle layer with data-driven radius/color 'without pulling in deck.gl', and OfflineMap.tsx says the full MapLibre+PMTiles+deck.gl stack from the original plan 'needs uninstalled packages and bundled tile assets and is intentionally out of scope' — i.e. deck.gl was planned, evaluated, and deliberately not used, but the dependency was never removed from package.json.

**Alternatives:** MapLibre GL JS alone (what is actually shipped): self-hosted PMTiles vector basemap, fully offline, WebGL2 native circle layers scale to thousands of points on GPU without deck.gl; deck.gl would only earn its cost if the app needed 100k+ point hexbin/arc/3D analytical overlays layered on top of a MapLibre basemap, which the current geo-analysis feature does not do.

**Reasoning:** Current best-practice guidance frames this exact split correctly: MapLibre GL JS is the right choice when the workflow centers on general interactive map rendering/navigation with full control over self-hosted tiles (this app's offline requirement makes self-hosted PMTiles a hard constraint anyway), and deck.gl earns its keep specifically for massive-dataset analytical overlays (100k+ points as hexbins/arcs/3D) layered on top. The repo's own MapLibreMap.tsx comment shows the team already reasoned through this tradeoff and chose the lighter-weight native-layer approach because their point counts (regions, not raw CDR pings) don't need deck.gl's GPU-instanced layer stack. Since it was evaluated and rejected rather than merely forgotten, and it isn't imported anywhere, keeping it in package.json is dead weight: extra install size/audit surface with no code path exercising it. Recommendation: remove both packages now; re-add deck.gl specifically (not the whole geoarrow layer stack) only if a future overlay genuinely needs to render 100k+ raw points on the map.

**Sources:**
  - [Using with MapLibre - deck.gl](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre)
  - [deck.gl vs MapLibre: Web Mapping and Visualization Compared - Atlas](https://atlas.co/comparisons/deck-gl-vs-maplibre/)
  - [Beyond vector tiles: Mapbox, MapLibre or DeckGL for my 3D map?](https://geomatico.es/en/vector-tiles-mapbox-maplibre-or-deckgl-for-my-3d-map/)

### vega / vega-lite / react-vega (grammar-of-graphics stack) — Redundant with sibling dependency

**Current choice:** vega, vega-lite, and react-vega are all package.json dependencies with zero imports anywhere in src, electron, scripts, or tests — only literal-string matches for the word 'vega' in unrelated filenames (e.g. telecom-report-runtime, day-analytics-tab) that happen to contain the substring, none of which import the vega packages.

**Usage evidence:** Confirmed dead: targeted grep for `from 'vega'`/`from 'vega-lite'`/`from 'react-vega'` returns zero hits in src. Independently confirmed by knip's unused-dependency report, which lists all three (`vega`, `vega-lite`, `react-vega`) under 'Unused dependencies'. No feature screen, worker, or export path references any of them.

**Alternatives:** N/A going forward beyond 'delete or actually adopt for a concrete need'; if a future feature wants a declarative grammar-of-graphics spec builder (e.g. a user-facing chart-builder where end users compose encodings), Vega-Lite/react-vega would be the correct evaluated choice at that point — but nothing in this codebase currently needs that (formulator-chart.tsx and the AI-driven chart specs in data-formulator already route through ECharts option objects, not Vega-Lite specs).

**Reasoning:** Vega-Lite/react-vega's real strength (per 2025-2026 sources) is declarative, grammar-based visualization specs and interaction composition, which is a genuinely different value proposition from ECharts' performance-oriented imperative API — but that value only materializes if something in the app actually emits or consumes Vega-Lite specs, and nothing does. Carrying three unused packages (vega, vega-lite, react-vega together pull in a nontrivial dependency tree including d3 internals) in an offline single-user Electron app adds install size and `pnpm audit`/security-scan surface for zero runtime benefit, and it also creates a false signal for future contributors about which charting stack to reach for. Recommendation: remove all three; if a declarative chart-spec feature (e.g. AI-generated Vega-Lite specs in data-formulator) is deliberately planned, re-add react-vega + vega-lite at that time with a concrete integration point, not vega (the lower-level runtime is unnecessary when vega-lite compiles to it internally and react-vega/vega-lite already bundle a vega-embed-compatible runtime).

**Sources:**
  - [A High-Level Grammar of Interactive Graphics - Vega-Lite](https://vega.github.io/vega-lite/)
  - [Grammar of Graphics in practice: Vega-Lite](https://data.europa.eu/apps/data-visualisation-guide/grammar-of-graphics-in-practice-vega-lite)
  - [Explo: Vega, Highcharts, and the future of Javascript-powered dashboard visualizations](https://www.explo.co/blog/javascript-dashboard-visualizations)

### uplot-config wordcloud rendering: wordcloud2 (direct UMD import) vs echarts-wordcloud — Redundant with sibling dependency

**Current choice:** echarts-wordcloud is a package.json dependency, but the actual word-cloud feature (src/features/analytics-theater/lib/wordcloud.ts, consumed by WordCloudScene) imports the raw `wordcloud2/src/wordcloud2.js` UMD module directly — a plain Canvas2D word-cloud renderer, not an ECharts series plugin.

**Usage evidence:** src/features/analytics-theater/lib/wordcloud.ts has an explicit comment: it imports the real UMD module from wordcloud2 'rather than the package main, which is a demo file with no export', and is dynamically imported so the renderer stays out of the main client chunk. `echarts-wordcloud` itself has zero imports anywhere in src and is flagged by knip as an unused dependency. This matches prior project history (memory: 'wordcloud rewritten on wordcloud2 canvas' during the OSV-Scanner elliptic-removal pass on Storybook) — wordcloud2 was adopted as the replacement and echarts-wordcloud was left behind uninstalled-in-code but still listed.

**Alternatives:** echarts-wordcloud (an ECharts series plugin that would require pulling word-cloud layout into the shared ECharts registry) vs the standalone wordcloud2 canvas library (lighter, decoupled from the ECharts registry, lazy-loadable on its own for a scene that is likely not on the default render path).

**Reasoning:** This isn't a live 'which is better' decision — the team already made and implemented the choice (wordcloud2, lazy-loaded, decoupled from the shared ECharts registry so the analytics-theater scene doesn't force-load extra ECharts series code into chunks that don't need it) and simply never removed the superseded `echarts-wordcloud` package. For an offline desktop app the standalone wordcloud2-direct-UMD approach is reasonable: it avoids growing the shared ECharts registry (echarts-core.ts) with a series type used by exactly one 'theater' scene, and the dynamic-import comment shows deliberate chunk-size awareness. Recommendation: remove `echarts-wordcloud` from package.json; no code change needed since it's already unused.

**Sources:**
  - [Unused dependencies - Knip](https://knip.dev/typescript/unused-dependencies)

### canvas-confetti (OffscreenCanvas + worker) vs react-confetti-boom for celebration effects — Redundant with sibling dependency

**Current choice:** canvas-confetti is used directly in src/features/ux-innovations/components/Celebrate.tsx with `useWorker: true`, rendering particles in an OffscreenCanvas off the main thread; react-confetti-boom remains a package.json dependency but is imported nowhere.

**Usage evidence:** Celebrate.tsx's own header comment states this explicitly: canvas-confetti with useWorker:true was chosen 'instead of competing with React reconciliation + DuckDB/chart work (the frame-drop bottleneck of the former main-thread react-confetti-boom)' — i.e. react-confetti-boom was the original implementation and was deliberately replaced. `react-confetti-boom` has zero imports in src and is flagged unused by knip.

**Alternatives:** react-confetti-boom (React-component API, simpler to drop in, but main-thread-only rendering per the repo's own comment); react-canvas-confetti (React wrapper around canvas-confetti, would add a wrapper layer for no benefit over the direct API already in use).

**Reasoning:** canvas-confetti's documented `useWorker: true` option moves particle rendering to an OffscreenCanvas in a worker specifically so it doesn't compete with the main thread — which in this app is simultaneously running React reconciliation, DuckDB queries, and chart re-renders, i.e. exactly the contention this app cannot afford to add jank to on a medium-end PC. This is a correctly-reasoned, measured swap (the comment cites the actual frame-drop symptom that motivated it), not speculative gold-plating. The only cleanup item is removing the now-dead `react-confetti-boom` entry from package.json since the migration was already completed in code.

> **Verify override:** was "Well-justified", changed to "Redundant with sibling dependency" — The researcher graded this row 'well-justified' as though it were a deliberate live two-library split, but repo inspection shows react-confetti-boom has zero actual imports anywhere in src — only two comments (in AchievementSystem.tsx and Celebrate.tsx) referring to it as 'the former main-thread react-confetti-boom' that 'is gone.' This is the identical pattern the researcher correctly flagged as redundant for echarts-wordcloud (a retired implementation still sitting in package.json): canvas-confetti with useWorker is indeed the right live implementation, but react-confetti-boom should be pruned from package.json as dead weight, not rated well-justified as a coexisting pair.

**Sources:**
  - [GitHub - catdad/canvas-confetti: performant confetti animation in the browser](https://github.com/catdad/canvas-confetti)
  - [canvas-confetti - npm](https://www.npmjs.com/package/canvas-confetti)
  - [Offscreen Canvas (Comparison between main thread and worker)](https://codepen.io/newinweb/pen/bxazNg)

---

## Maps / geospatial stack

_Packages: leaflet, react-leaflet, maplibre-gl, @protomaps/basemaps, pmtiles, h3-js, deck.gl, @geoarrow/deck.gl-layers, supercluster_

**Cluster sanity-check:** Verified against the actual source, not just docs. The researcher correctly accounted for the offline/single-process/single-user nature of the app, and if anything under-stated how clear-cut several of these calls are:

- Leaflet + react-leaflet: zero imports anywhere in src/tests/stories — grep across the whole repo finds them only in package.json/lockfile/docs. OfflineMap.tsx's own header comment documents the exact reason they were ripped out ("the old Leaflet TileLayer fetched raster basemap tiles from tile.openstreetmap.org, which renders blank with no network"). "redundant-with-sibling-dependency" is correct and arguably conservative — this is fully dead, already-replaced code, not a live tradeoff.
- MapLibre + PMTiles + @protomaps/basemaps: genuinely wired end-to-end (pmtiles-protocol.ts, local-style.ts using @protomaps/basemaps layers()/namedFlavor(), GeoMap.tsx feature-detection). But `public/maps/basemap.pmtiles` does not exist anywhere in the repo, so `hasBundledBasemap()` always resolves false today and the app always falls back to the canvas OfflineMap — a very concrete instance of "right tool, currently underused" that strengthens rather than undermines the verdict.
- deck.gl + @geoarrow/deck.gl-layers: zero usage anywhere (not even attempted) — MapLibreMap.tsx explicitly says it renders circles "without pulling in deck.gl," and OfflineMap.tsx calls the deck.gl vector-basemap plan "intentionally out of scope." tech-radar.md shows deck.gl/@geoarrow were originally scoped for 3M–10M point Arrow layers, wildly beyond REGION_LIMIT = 200. Verdict confirmed, understated if anything.
- supercluster: the worker's own header comment is a literal decision record — "the ELK layered-DAG and supercluster point-clustering surfaces were removed as dead code ... geo-analysis renders region aggregates without supercluster point clustering." Verdict fully confirmed.
- h3-js: unlike supercluster, this one is *not* ripped out — `hexbin()` is fully implemented in layout.worker.ts and exported via getLayoutProxy(), but the codebase's own internal audit (docs/planning/redesign/_features.md) independently confirms "no feature calls them," and grep finds zero real call sites for `.hexbin(`. So "right-tool-underused" (built, wired, architecturally sound in a worker, zero consumers) is a materially different and more accurate status than supercluster's "tried-and-removed," justifying the differentiated verdicts. One caveat worth surfacing: the researcher's stated future use case (binning raw lat/lon call events) assumes per-event coordinates that don't exist in this app's data model today — use-geo-data.ts geocodes named regions via an offline gazetteer to centroids, not per-call CDR coordinates — so realizing h3's value needs a data-model change, not just wiring the existing worker call. This softens but doesn't invalidate the verdict, since the researcher already hedged with "if this tool ever needs."

No verdict needed overriding; the cluster's calls hold up under adversarial scrutiny, and in most cases the evidence is stronger than what was cited.

### Leaflet + react-leaflet (raster map engine) — Redundant with sibling dependency

**Current choice:** leaflet ^1.9.4, react-leaflet ^5.0.0, @types/leaflet ^1.9.21 — installed as direct dependencies

**Usage evidence:** Zero imports anywhere in src/ (grep for `from "leaflet"` / `from "react-leaflet"` across all .ts/.tsx returns nothing). The only trace is a code comment in src/features/geo-analysis/components/OfflineMap.tsx documenting that Leaflet was ripped out: 'the old Leaflet `TileLayer` fetched raster basemap tiles from `tile.openstreetmap.org`, which renders blank with no network.' 3.9MB (leaflet) + 199KB (react-leaflet) on disk for code that no longer exists.

**Alternatives:** MapLibre GL JS (already installed) with self-hosted PMTiles vector tiles is the 2025-2026 consensus replacement for exactly this scenario. Comparison pieces (Jawg, Bathyl, PkgPulse, Atlas, js-maps.com) converge on: Leaflet wins only for raster-tile simplicity + zero deps + old-browser support; MapLibre wins for vector tiles, GPU/WebGL rendering, data-driven styling and no per-marker DOM nodes at scale — all of which matter more once you've committed to self-hosted vector tiles.

**Reasoning:** This app is offline-first on a local machine, so Leaflet's classic model (raster PNG/JPG tiles fetched from a live tile server) is a structural mismatch, not a viable option: it either needs a live network endpoint (breaks the offline contract) or a pre-rendered raster tile pyramid vendored to disk (large, low-quality vs. a single PMTiles vector archive). The team already reached this conclusion once — the OfflineMap.tsx comment is effectively a design decision record explaining why Leaflet's TileLayer was deleted — but the packages were never removed from package.json/pnpm-lock.yaml, so they're pure lockfile/install-size debt with a code comment as their only remaining trace. There is no code path where re-adding Leaflet would be preferable to finishing the already-built MapLibre+PMTiles path. Delete the dependency.

**Sources:**
  - [MapLibre GL JS vs. Leaflet: Choosing the right tool for your interactive map](https://blog.jawg.io/maplibre-gl-vs-leaflet-choosing-the-right-tool-for-your-interactive-map/)
  - [MapLibre vs Leaflet: When to Use Which | Bathyl](https://www.bathyl.com/en/blog/when-to-use-maplibre-instead-of-leaflet)
  - [Mapbox vs Leaflet vs MapLibre: Maps 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026)
  - [MapLibre vs Leaflet: JavaScript Map Libraries Compared | Atlas](https://atlas.co/comparisons/maplibre-vs-leaflet/)

### MapLibre GL JS + PMTiles + @protomaps/basemaps (vector basemap engine) — Right tool, underused

**Current choice:** maplibre-gl ^5.24.0, pmtiles ^4.4.1, @protomaps/basemaps ^5.7.2 — real, tested implementation (MapLibreMap.tsx, pmtiles-protocol.ts, local-style.ts), code-split via next/dynamic so it's only pulled into the bundle when GeoMap.tsx decides to mount it

**Usage evidence:** Fully wired and has unit tests (tests/features/geo-analysis/lib/pmtiles-protocol.test.ts, local-style.test.ts), and every asset URL is same-origin (`/maps/basemap.pmtiles`, `/maps/fonts/...`, `/maps/sprites/...`) so it never violates the offline/CSP posture. BUT repo-wide search for `basemap.pmtiles`/`maps/fonts`/`maps/sprites` outside geo-analysis source and tests turns up no build script, no asset pipeline, and no committed file that actually produces those assets in public/. `hasBundledBasemap()` does a same-origin range-request probe and silently falls back to the hand-rolled canvas map (OfflineMap.tsx) on any failure — which is what happens on every build today, since the .pmtiles archive is never generated. In the shipped app, MapLibreMap.tsx currently never mounts.

**Alternatives:** PMTiles + MapLibre is the standard 2025-2026 pattern for self-hosted/offline vector maps: a single Hilbert-ordered archive read via HTTP range requests, no tile server, no CDN, no per-tile files — exactly what an offline Electron app with a bundled local HTTP server needs. The realistic alternative to 'finish the pipeline' is 'delete the dormant engine and keep only the canvas fallback' — there's no third vector-basemap library that fits better here.

**Reasoning:** For a genuinely offline desktop app, this was the correct call over hosted raster tiles or a live vector-tile server — PMTiles' whole value proposition (one file, range-read locally, no infra) maps directly onto 'ships inside an Electron app with no internet.' The problem is not the technology choice, it's that the asset pipeline to actually produce basemap.pmtiles + glyphs + sprites (e.g. via tilemaker against a Tunisia OSM extract, as the ecosystem docs describe) was never built, so this is 45MB of installed library plus real, tested application code that is currently inert scaffolding in every shipped build. Given the single-user/offline/medium-end-PC constraints, carrying a dormant WebGL engine indefinitely is worse than either (a) finishing the pipeline — generate and vendor a Tunisia-scoped .pmtiles + fonts + sprites, a one-time few-MB asset, so the feature actually activates — or (b) if that's not scheduled, dropping maplibre-gl/pmtiles/@protomaps/basemaps until it is, and shipping only the canvas OfflineMap that already covers the real 200-region use case. Don't leave it half-built.

**Sources:**
  - [PMTiles Concepts | Protomaps Docs](https://docs.protomaps.com/pmtiles/)
  - [Protomaps — The open source map in a file](https://protomaps.com/)
  - [Self hosted maps for (practically) free](https://dev.to/aaronblondeau/self-hosted-maps-for-practically-free-1i3n)
  - [Building a self-hosted offline map server with Protomaps and OpenStreetMap tiles for mobile navigation backup](https://vipinpg.com/blog/building-a-self-hosted-offline-map-server-with-protomaps-and-openstreetmap-tiles-for-mobile-navigation-backup/)

### deck.gl + @geoarrow/deck.gl-layers (GPU point-rendering framework) — Redundant with sibling dependency

**Current choice:** deck.gl ^9.3.4, @geoarrow/deck.gl-layers ^0.3.2 — installed direct dependencies

**Usage evidence:** Zero imports anywhere in src/. MapLibreMap.tsx's own doc comment states the region-circle layer scales 'without a per-marker DOM node and without pulling in deck.gl' — i.e. the team explicitly evaluated and declined deck.gl for this feature. Worse, deck.gl's `@deck.gl/arcgis` sub-package declares `@arcgis/core` as a peer dependency, and pnpm auto-installs it: `du -sh node_modules/.pnpm/@arcgis+core@4.34.8` reports 105MB, confirmed resolved in pnpm-lock.yaml. So this cluster is ~111MB+ of installed code (deck.gl 5.0MB + @geoarrow layers 1.1MB + @arcgis/core 105MB) backing zero call sites.

**Alternatives:** deck.gl is the right tool once you need GPU-instanced rendering of tens of thousands to millions of points with dynamic filtering — real-world comparisons (geomatico.es, Center for Coastal Climate Resilience) put deck.gl ahead of MapLibre/Mapbox specifically at that scale (e.g. 200k-point biodiversity datasets). Below that scale, a native MapLibre `circle` layer with data-driven paint expressions (as MapLibreMap.tsx already implements) is simpler, lighter, and GPU-accelerated on its own via WebGL.

**Reasoning:** This app's geo feature deliberately caps at REGION_LIMIT = 200 named administrative regions (src/features/geo-analysis/hooks/use-geo-data.ts) — nowhere close to the point counts where deck.gl's GPU-instancing advantage over a native MapLibre circle layer actually shows up. The team's own comment confirms this was a conscious choice, not an oversight. On a medium-end offline PC where install size, build time, and cold-start memory matter more than they would on a cloud web app, carrying a 111MB dependency chain (including an ArcGIS SDK peer that has nothing to do with this app) for a feature that explicitly avoids it is pure waste. Uninstall both packages.

**Sources:**
  - [Beyond vector tiles: Mapbox, MapLibre or DeckGL for my 3D map?](https://geomatico.es/en/vector-tiles-mapbox-maplibre-or-deckgl-for-my-3d-map/)
  - [PMTiles in deck.gl (Part I). Map rendering the fast way](https://medium.com/center-for-coastal-climate-resilience-visualizatio/pmtiles-in-deck-gl-part-i-1ec68814f2da)
  - [Using with MapLibre | deck.gl](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre)

### h3-js (H3 hexbin spatial aggregation) — Right tool, underused

**Current choice:** h3-js ^4.4.0 — installed and fully wired end-to-end: exposed from a dedicated worker (src/workers/layout.worker.ts) via Comlink, with a lazy client singleton (src/platform/viz/layout-client.ts: getLayoutProxy()) and a public re-export (src/platform/viz/index.ts)

**Usage evidence:** The plumbing is real (worker, Comlink proxy, exported client function), but grep for `getLayoutProxy` and `.hexbin(` across all of src/ finds only the export statement, the worker's own implementation, and doc-comment usage examples (`const bins = await layout!.hexbin(points, resolution);`) — no screen or component ever actually calls it. It is dormant infrastructure, not dead code in the strict sense (it's reachable and would work), but it currently backs no UI.

**Alternatives:** For cell-based spatial aggregation/heatmaps, H3 (hierarchical hexagonal grid) is the current standard over Geohash/Quadkey for analytics use cases needing consistent-area, low-directional-bias cells — Uber's own ecosystem and multiple 2025 comparison pieces confirm this. It's also a good offline fit: pure JS, no WASM, no network calls, matching this app's constraints exactly.

**Reasoning:** If this telecom CDR tool ever needs to bin raw lat/lon call events (as opposed to the current ≤200 named-region rollups) into a density heatmap, H3 is a defensible, offline-appropriate choice, and running it off the main thread in a worker is the right architecture for a medium-end PC. But today it's 6.5MB of installed library plus three files of maintained plumbing (worker + client + barrel export) for a feature that doesn't exist anywhere in the UI. That's acceptable as short-lived staged infrastructure, but as standing state it's a liability: it's untested-by-usage code that will silently bit-rot, and anyone auditing dependencies has to rediscover it's dormant. Either schedule the hexbin heatmap view that would consume it, or delete the worker/client/export and the h3-js dependency until that feature is actually planned — don't carry dormant infra indefinitely.

**Sources:**
  - [Understanding spatial indexes: H3 explained](https://felt.com/blog/h3-spatial-index-hexagons)
  - [Hexbin | H3](https://h3geo.org/docs/comparisons/hexbin/)
  - [Geohash vs H3: Which Geospatial Indexing System Should I Use?](https://dataarmyintel.io/knowledge-article/geohash-or-h3-which-geospatial-indexing-system-should-i-use/)

### supercluster (point clustering library) — Redundant with sibling dependency

**Current choice:** supercluster ^8.0.1 — installed direct dependency

**Usage evidence:** Zero imports anywhere in src/. The layout.worker.ts header comment explicitly documents its removal: 'the ELK layered-DAG (`layoutGraph`) and supercluster point-clustering surfaces were removed as dead code — ... geo-analysis renders region aggregates without supercluster point clustering.' This is the most explicit of the five findings: the team's own comments confirm it was deliberately deleted as unused, but the npm dependency was left behind.

**Alternatives:** MapLibre GL JS has clustering built directly into `GeoJSONSource` (`cluster: true`, `clusterRadius`, `clusterMaxZoom`) using its own bundled clustering implementation — confirmed by MapLibre's own docs and examples (maplibre.org clustering example, Stadia Maps clustering tutorial). So even in a future where this app needs point clustering again, it would not need supercluster as a separate top-level dependency at all; it would just enable the existing MapLibre source's native option.

**Reasoning:** This is the clearest case in the cluster: the code comment is effectively a decision record stating supercluster was tried and removed, and the current design (≤200 regions rendered as individual circles) has no clustering need at all. Even if clustering becomes necessary later (e.g. if the region limit were lifted), MapLibre's own native `cluster: true` option — already available for free once maplibre-gl is a dependency — covers it without a separate package. Uninstall supercluster; there is no scenario in this app where it earns its place back over MapLibre's built-in clustering.

**Sources:**
  - [Create and style clusters - MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/)
  - [Clustering with MapLibre GL JS - Stadia Maps Documentation](https://docs.stadiamaps.com/tutorials/clustering-styling-points-with-maplibre/)
  - [GitHub - mapbox/supercluster](https://github.com/mapbox/supercluster)

---

## Document/report export stack

_Packages: docx, pdfmake, jspdf, jspdf-autotable, pptxgenjs, exceljs, html-to-image, html2canvas_

**Cluster sanity-check:** The researcher correctly weighted the offline/single-process/no-server constraint (worker-offloaded pdfmake, no CDN fonts, streaming exceljs writer) and correctly caught html2canvas as genuinely stale/superseded. However, one verdict is inconsistent with its own reasoning: the jsPDF+jspdf-autotable entry presents evidence that fully rebuts redundancy (docs explicitly designate the split, and I confirmed in `src/features/telecom/components/export-panel.tsx` that every autoTable() call there operates on small aggregated summary rows — channels/operators/status/revenue-groups, never raw transactions — matching the documented "OOMs past ~2.5k rows, use only for quick/light" boundary) yet is labeled "reconsider" rather than "well-justified." I also found stronger-than-stated evidence for the html-to-image entry: grep across `src/` shows zero call sites for both html2canvas and html-to-image, and — notably — the analytics-theater feature (the researcher's own cited "unbuilt feature" candidate) has actually been built (`src/features/analytics-theater/lib/scene-export.ts`), with its own comment explicitly stating it "NEVER" does a DOM screenshot, rasterizing charts via ECharts SSR instead — the same convention independently repeated in `src/features/report-studio/lib/charts.ts`. So the one concrete feature that was supposed to consume html-to-image shipped without it, twice reinforcing a house rule against DOM-screenshot capture. This doesn't flip the verdict bucket (researcher already had it at "reconsider," not "well-justified"), but it means the "reserved for unbuilt feature" framing is now weaker/more speculative than presented, and closer to YAGNI-violating dead weight than an imminent need.

### pdfmake as primary/worker PDF engine — Well-justified

**Current choice:** pdfmake ^0.3.11

**Usage evidence:** Used in D:\data-navigator\src\features\report-studio\lib\pdf-report.ts and D:\data-navigator\src\workers\export.worker.ts, both invoked off the renderer main thread via a Comlink worker (D:\data-navigator\src\features\report-studio\workers\export.worker.ts, D:\data-navigator\src\features\report-studio\hooks\use-export-worker.ts). Drives report-studio custom reports and reconciliation exports (D:\data-navigator\src\features\reconciliation\lib\recon-export.ts, which streams up to 50,000 DuckDB rows via a paginated AsyncGenerator). Code comments in pdf-report.ts state explicitly: 'pdfmake replaces the old jsPDF + jspdf-autotable path (autotable OOMs past a few thousand rows)'.

**Alternatives:** jsPDF+jspdf-autotable (still in the repo, see next entry); @react-pdf/renderer (React-reconciler based, heavier CPU/WASM cost for very large tables per the project's own tech-radar doc at docs/planning/v2/tech-radar.md); Puppeteer/headless-Chromium HTML->PDF (not viable offline-desktop-friendly, adds a full browser process); server-side PDF services (irrelevant, this is a fully offline single-user app, no server).

**Reasoning:** This app has no server and must stay 100% offline on medium-end consumer hardware, so 'render PDF without blocking the UI, without exploding memory on large tables' is the real constraint — not generic 'PDF library popularity'. pdfmake's declarative table model auto-paginates and repeats headers, and it runs entirely inside a Web Worker with its own bundled Roboto vfs (fully offline, OS-font-independent). Live npm data confirms pdfmake is healthily maintained (0.3.11 published 2026-06-12, with the 0.3 stable line only cut 2026-01-01 after a long dormant period) and jspdf-autotable still has a documented, unresolved large-dataset problem (GitHub issue: 100k rows can occupy >1GB and the memory isn't released after generation), which matches this app's own stated rationale for switching reconciliation/report-studio off it. Running it in a worker is the correct choice for a single renderer process that must stay responsive — this is one of the few places generic 'move heavy work off the main thread' advice directly transfers to this app.

**Sources:**
  - [jspdf-autotable vs pdfmake — npm trends / feature comparison](https://npmtrends.com/jspdf-autotable-vs-pdfmake)
  - [jsPDF-AutoTable Issue #840 — Performance and handling a big set of data](https://github.com/simonbengtsson/jsPDF-AutoTable/issues/840)
  - [pdfmake npm package page](https://www.npmjs.com/package/pdfmake)
  - [pdfmake 0.3 docs](https://pdfmake.github.io/docs/0.3/)

### jsPDF + jspdf-autotable kept for a bounded, main-thread 'Overview' dashboard PDF — Well-justified

**Current choice:** jspdf ^4.2.1, jspdf-autotable ^5.0.8

**Usage evidence:** Only real usage site is D:\data-navigator\src\features\telecom\components\export-panel.tsx (exportPDF callback, lines ~586-970): 10 autoTable() calls building a single-page-ish branded KPI/canal/operator/region summary from fixed-size aggregate arrays (not raw per-row CDR data), rendered synchronously on the renderer main thread with hand-positioned colored header bars via jsPDF's low-level drawing API (rect/text/fillColor). No other file imports jspdf or jspdf-autotable; the strings 'jspdf'/'jsPDF'/'autoTable' elsewhere are only doc comments describing why pdfmake replaced this path for large tables.

**Alternatives:** Migrate this one file to pdfmake for consistency (single PDF engine, worker-off-main-thread, no jsPDF drawing-API boilerplate for the colored header bars — pdfmake supports canvas-drawing primitives and svg for that); or keep jsPDF for this one lightweight, precisely-positioned branded one-pager since the data volume here is small and bounded by design (fixed KPI/canal/operator lists, not per-transaction rows) so the OOM risk that motivated dropping autotable elsewhere does not apply.

**Reasoning:** This is not accidental duplication — the project's own tech-radar doc (docs/planning/v2/tech-radar.md) explicitly designates the split as intentional: 'keep jspdf for light/quick PDFs only; jspdf-autotable HOLD (OOMs past ~2.5k rows) — use pdfmake for data tables', and the actual code matches that policy (bounded aggregate tables only, never raw CDR rows). Given that, the pair is defensible today. But two PDF-generation code paths with different styling primitives, different offline-font handling, and one running synchronously on the renderer main thread (this file) versus one always off-thread (pdfmake) is a real maintenance and consistency cost for a small single-maintainer codebase — every future PDF export decision has to remember which engine owns which use case. Since pdfmake already handles bespoke branded layouts elsewhere (colored header rects, custom sections, vector SVG chart embeds) in report-studio's pdf-report.ts, the same could be replicated here without meaningfully increasing bundle size (jsPDF+autotable together are already paid for once pdfmake is also bundled) — the main cost of consolidating is a one-time rewrite of ~10 autoTable() calls, not a technology gap. Recommend: no urgent action given current usage is genuinely bounded/low-risk, but flag for consolidation onto pdfmake next time this file is touched, to remove one whole dependency pair and one code path.

> **Verify override:** was "Reconsider", changed to "Well-justified" — The researcher's own cited evidence (tech-radar doc explicitly designates the pdfmake/jspdf split as intentional; jspdf-autotable HOLD only for large tables) plus my independent verification of src/features/telecom/components/export-panel.tsx confirm every autoTable() call there feeds small, pre-aggregated summary rows (channels, operators, status buckets, revenue groups — tens of rows, never raw transactions), and the code runs on the main thread outside any worker, matching the 'quick, bounded, branded dashboard snapshot' use case the split was designed for. The presented reasoning argues for justification, not caution, so 'reconsider' understates it — this is a genuinely different sub-problem (bounded on-screen quick export) from pdfmake's job (bulk auto-paginating data tables in a worker), not accidental duplication.

**Sources:**
  - [jsPDF npm package (v4.2.1)](https://www.npmjs.com/package/jspdf)
  - [jspdf-autotable npm package (v5.0.8, jsPDF 3.0 upgrade)](https://www.npmjs.com/package/jspdf-autotable)
  - [jsPDF-AutoTable Issue #627 — Issue with AutoTable and Large Amounts of Data](https://github.com/simonbengtsson/jsPDF-AutoTable/issues/627)

### html2canvas — DOM screenshot library — Redundant with sibling dependency

**Current choice:** html2canvas ^1.4.1

**Usage evidence:** Zero import sites anywhere in src/. The single grep hit repo-wide (outside package.json/pnpm-lock.yaml/docs) is a comment in D:\data-navigator\src\features\report-studio\lib\charts.ts explicitly stating the project 'deliberately avoid[s] DOM-screenshotting (html2canvas) per the project tech-radar rule' in favor of ECharts SSR-to-SVG rendering. Confirmed via the project's own dead-code scanner: `pnpm exec knip --dependencies` flags `html2canvas package.json:167:6` as unused, and it is not present in knip.json's `ignoreDependencies` allowlist (unlike deliberately-reserved ML deps such as onnxruntime-web/sharp).

**Alternatives:** html-to-image (fork of dom-to-image, foreignObject-SVG based, better modern CSS/flex/grid support); Snapdom (newer, faster, ~2k GitHub stars, DOM-clone-to-SVG approach); native chart export via echarts.getDataURL()/renderToSVGString() (what this app actually uses today — no DOM screenshot at all).

**Reasoning:** html2canvas's last real release was v1.4.1 on 2022-01-22 (verified via `gh api repos/niklasvh/html2canvas/releases`) — nearly 4.5 years stale as of 2026-07, contradicting one AI-search summary that (incorrectly) called it 'actively maintained in 2025'; the GitHub repo's last code push was 2024-07-18, still ~2 years old and not a release. The project's own tech-radar doc already reached the correct conclusion internally ('stale/experimental... fallback for canvas/WebGL captures only') but that fallback path was never actually implemented — there is no canvas/WebGL capture code anywhere that uses it. For a single offline desktop process on medium-end hardware, every unused dependency is pure bundle/install-time cost (extra ~200KB+ in node_modules, extra supply-chain surface in `pnpm audit`/gitleaks/Semgrep scans) with zero runtime benefit. This should simply be removed; if a genuine canvas/WebGL screenshot need appears later, evaluate html-to-image's own canvas capture path or re-add a maintained library at that time rather than carrying dead weight now.

**Sources:**
  - [niklasvh/html2canvas GitHub releases (verified via GitHub API: last release 2022-01-22)](https://github.com/niklasvh/html2canvas/releases)
  - [Snapdom: a modern and faster alternative to html2canvas](https://dev.to/tinchox5/snapdom-a-modern-and-faster-alternative-to-html2canvas-1m9a)
  - [Here's Why I'm Replacing html2canvas With html-to-image in Our React App](https://betterprogramming.pub/heres-why-i-m-replacing-html2canvas-with-html-to-image-in-our-react-app-d8da0b85eadf)

### html-to-image — DOM-to-image library, reserved for unbuilt feature — Reconsider

**Current choice:** html-to-image ^1.11.13

**Usage evidence:** Zero import sites in src/ today (confirmed by grep and by `pnpm exec knip --dependencies`, which flags `html-to-image package.json:166:6` as unused). It is referenced only in planning docs (docs/planning/v2/features/analytics-theater.md, dependency-catalog.md, tech-radar.md) as the intended DOM-capture tool for a not-yet-built 'analytics theater / presentation export' feature — that feature currently renders 100% Math.random() synthetic data per the project's own gap-analysis doc and has no export path wired up at all.

**Alternatives:** html2canvas (stale, see above — project docs already correctly reject it); native echarts.getDataURL()/renderToSVGString() for pure-chart captures (already used elsewhere in this app, e.g. D:\data-navigator\src\features\report-studio\lib\charts.ts, and preferred by the project's own docs even for the planned feature: 'Prefer native chart getDataURL for charts'); Snapdom as a newer alternative if evaluated fresh.

**Reasoning:** Unlike html2canvas, html-to-image is genuinely current (v1.11.13 published 2025-02-14) and is the correct pick per the project's own tech-radar reasoning IF a DOM-composite-to-image capture is ever actually needed (e.g., capturing a composed KPI-card+caption scene that isn't a single chart canvas). But right now it is pre-installed speculatively for a feature (analytics-theater) that per the project's own docs doesn't yet touch real data or have any export code, which is exactly the kind of premature dependency the project's stated coding-style rules (YAGNI: 'do not build features or abstractions before they are needed') argue against. It's lower-severity than html2canvas (not stale, not literally superseded-and-then-still-shipped) but it's still dead weight today. Recommend removing it now and re-adding when analytics-theater's export path is actually implemented, rather than carrying an unused dependency through every `pnpm audit`/security scan/CI knip warning in the meantime; if the team prefers to keep the reservation, add it to knip.json's `ignoreDependencies` (matching how sharp/onnxruntime-web are explicitly reserved) so the intent is machine-readable rather than living only in a planning doc.

**Sources:**
  - [html-to-image npm package (v1.11.13, published 2025-02-14)](https://www.npmjs.com/package/html-to-image)
  - [dom-to-image vs html-to-image vs html2canvas comparison](https://npm-compare.com/dom-to-image,html-to-image,html2canvas)

### exceljs as the XLSX read/write engine — Reconsider

**Current choice:** exceljs ^4.4.0

**Usage evidence:** Actively used across 11 files: D:\data-navigator\src\features\report-studio\lib\xlsx-generator.ts, D:\data-navigator\src\workers\export.worker.ts, D:\data-navigator\src\platform\parsers\xlsx-to-csv.ts, D:\data-navigator\src\platform\parsers\file-parsers\excel-parser.ts, D:\data-navigator\src\features\telecom\components\export-panel.tsx, D:\data-navigator\src\features\history\data\export-history.ts, D:\data-navigator\src\features\geo-analysis\lib\geo-export.ts, D:\data-navigator\src\features\folders\lib\catalogExport.ts, plus screen-level call sites. However, actual code uses `new ExcelJS.Workbook()` (fully in-memory) in both xlsx-generator.ts and export.worker.ts, NOT the streaming `WorkbookWriter` that the project's own dependency-catalog/tech-radar docs claim is the reason exceljs was chosen ('streaming WorkbookWriter, ~6x less memory than SheetJS').

**Alternatives:** @protobi/exceljs (actively maintained community fork, drop-in API-compatible, published as recently as 2026-05-07, created specifically because upstream exceljs stalled); xlsx-kit (newer, MIT, TypeScript-first, openpyxl-inspired); SheetJS/xlsx (broadest format support but in-memory-only, and its 'Pro' CDN distribution model is CDN/offline-bundling-unfriendly for this app — already correctly rejected per the project's own tech-radar).

**Reasoning:** exceljs is genuinely load-bearing (11 real call sites, both import and export paths) so it is not redundant with a sibling package — but the underlying npm package itself is stale: 4.4.0 was published 2023-10-19, with no release in the ~2.75 years since (confirmed via npm registry), and it currently pulls in glob 7.x with a known command-injection advisory (CVE-2025-64756) plus ReDoS/inflight transitive issues per Snyk/GitHub. For an offline single-user desktop app the runtime blast radius of a glob/archiver-path vulnerability during an interactive local XLSX export is low, but it still fails a clean `pnpm audit`, and this project already has a documented pattern (per memory) of eliminating audit findings via targeted pnpm.overrides rather than ignoring them. The maintained @protobi/exceljs fork exists precisely to fix this (explicitly aims to be a 'drop-in replacement' and plans to sunset once upstream catches up), so swapping the dependency (or pointing a pnpm override at it) is low-risk relative to a full library migration. Separately, the docs' claim that this app uses exceljs's streaming WorkbookWriter for memory efficiency does not match the actual code (`new ExcelJS.Workbook()` is in-memory); this is a doc/code drift worth fixing or acting on given the project's own stated 'medium-end PC, resource-constrained' target, especially for the geo-analysis/history/catalog exports that could plausibly emit large sheets.

**Sources:**
  - [exceljs npm package (4.4.0, published 2023-10-19)](https://www.npmjs.com/package/exceljs)
  - [Active Community Fork Available: @protobi/exceljs — exceljs GitHub Discussion #3008](https://github.com/exceljs/exceljs/discussions/3008)
  - [ExcelJS Community Fork - Fixing Critical Bugs & Looking for Maintainers — exceljs GitHub Discussion #2987](https://github.com/exceljs/exceljs/discussions/2987)
  - [[BUG] Exceljs requires glob 7.x, which has a command injection vulnerability — exceljs Issue #3006](https://github.com/exceljs/exceljs/issues/3006)

### docx (dolanmiu/docx) for DOCX generation — Well-justified

**Current choice:** docx ^9.7.1

**Usage evidence:** Used in D:\data-navigator\src\workers\export.worker.ts and D:\data-navigator\src\features\report-studio\lib\docx-generator.ts (dynamically imported inside the report-studio export worker per D:\data-navigator\src\features\report-studio\hooks\use-export-worker.ts / workers/export.worker.ts). No competing DOCX library present in the repo — this is the sole DOCX engine.

**Alternatives:** officegen (older, less actively maintained); docx-templates (template-merge only, listed in the project's own tech-radar as an optional complement, not adopted); server-side LibreOffice/Pandoc conversion (rejected implicitly by this app's offline/no-native-process-dependency posture).

**Reasoning:** There is no redundant sibling for DOCX generation, and the pick fits the constraints well: pure JS/TS, zero native dependencies (important for a resource-constrained Electron app that already bundles a lot of native code — DuckDB, better-sqlite3, node-llama-cpp — where every additional native dependency is an ABI/packaging risk per this repo's own documented native-ABI pain), and it's healthily maintained (9.7.1 published 2026-05-27). Running it inside the dedicated report-studio worker alongside pptxgenjs/pdfmake/exceljs keeps large-document generation off the renderer main thread, consistent with this app's single-process, must-stay-responsive constraint.

**Sources:**
  - [docx npm package (dolanmiu/docx, v9.7.1, published 2026-05-27)](https://www.npmjs.com/package/docx)
  - [dolanmiu/docx GitHub](https://github.com/dolanmiu/docx)

### pptxgenjs for PPTX generation — Well-justified

**Current choice:** pptxgenjs ^4.0.1

**Usage evidence:** Used in D:\data-navigator\src\workers\export.worker.ts, D:\data-navigator\src\features\report-studio\lib\pptx-generator.ts, and D:\data-navigator\src\workers\resvg-raster.ts (chart rasterization support for embedding into slides). Sole PPTX engine in the repo, run inside the report-studio worker.

**Alternatives:** officegen (broader Office format support but far less active); no other zero-dependency offline PPTX generator has comparable adoption (300k weekly downloads, ~3.5k GitHub stars) as of 2025-2026.

**Reasoning:** pptxgenjs is effectively the only serious zero-runtime-dependency, browser/Node-compatible PPTX generator, which matters a lot here since this app cannot shell out to PowerPoint/LibreOffice at runtime (offline, single-user desktop, no guaranteed Office install). It is reasonably current (4.0.1 published 2025-06-26) though slower-moving than docx/pdfmake — worth a periodic check but not a concern today given no active bug pressure. Correctly kept off the main thread in the shared report-studio worker.

**Sources:**
  - [pptxgenjs npm package (v4.0.1, published 2025-06-26)](https://www.npmjs.com/package/pptxgenjs)
  - [PptxGenJS official site](https://gitbrent.github.io/PptxGenJS/)

---

## Build / release tooling

_Packages: tsup, esbuild, jiti, binaryen, sonda, size-limit, publint, @microsoft/api-extractor, @microsoft/api-documenter, @arethetypeswrong/cli_

**Cluster sanity-check:** The researcher correctly grounded this in the app's actual shape rather than generic npm-library best practice: package.json is `"private": true` with a single `main` field and no `exports`/`module`/`types` map, and release.yml's own comment confirms "Private root package: `changeset publish` skips npm" — so the "reconsider" calls on publint, api-extractor/api-documenter, and attw are solid (these are pre-`npm publish` consumer-facing gates for a project that structurally never publishes to npm). The esbuild-vs-tsup split was verified as two genuinely different sub-problems (standalone addressable worker bundles with Storybook reuse vs. an Electron-main CJS bundle needing external/noExternal native-module handling and watch-mode CLI ergonomics) rather than redundant overlap. jiti's "invisible but load-bearing" role was confirmed against the actual pnpm dependency graph (size-limit's optional peer dep, tsup's transitive dep via postcss-load-config). binaryen and Sonda were correctly caught as installed-but-inert (grep confirms no wasm-opt/wasm-dis invocation anywhere, and no Sonda plugin registered in next.config.ts or tsup.config.ts) — worth noting the binaryen case is even weaker than "unused but plausible" suggests, since every vendored .wasm in this repo (onnxruntime-web, pyodide, resvg-wasm, mediapipe) is a prebuilt upstream artifact copied in via scripts/copy-worker-assets.mjs, not something this repo compiles from source, so there's no natural call site for wasm-opt even in principle. One verdict needs correction: size-limit was rated "well-justified" partly on the premise that its time-budget preset is "a directly relevant guardrail" — but quality.yml's own header comment states "The advisory size-limit and Lighthouse jobs were removed — flaky/heavy for no signal," no other workflow invokes it, and lefthook.yml (git hooks) is entirely commented out. So despite `.size-limit.json` being a well-crafted, app-specific config (per-route byte budgets plus real per-worker time budgets), it currently has zero automated enforcement path — it's exactly as dormant as the tools that drew "reconsider," just with better config authored for a hypothetical re-wiring.

### tsup for Electron main-process bundling — Well-justified

**Current choice:** tsup 8.5.1 (tsup.config.ts) bundles electron/main.ts, electron/preload.ts, and electron/workers/duckdb.utility.ts into a single build/main.js CJS entry, with a large `external` allowlist for native/prebuilt modules (electron, @duckdb/node-api, better-sqlite3, node-llama-cpp, next, etc.)

**Usage evidence:** Actively wired: `electron:build` / `electron:build:watch` npm scripts run tsup directly; it feeds desktop:build -> electron:package/make/publish, i.e. it produces the actual shipped Electron main process. Confirmed via tsup.config.ts and package.json scripts.

**Alternatives:** Raw esbuild (already used elsewhere in this repo for workers) with a hand-written watch loop; electron-vite / electron-builder toolchains; Rollup or unbuild for dual ESM/CJS + .d.ts rollup (not needed here since output is single-target CJS)

**Reasoning:** tsup's headline value (dual ESM/CJS output, automatic .d.ts rollup) is irrelevant here since this only emits one CJS entry for Electron's main process, and tsup.config.ts has no `dts` option enabled. But tsup does give a zero-config, fast incremental watch mode used by `electron:build:watch` during `pnpm dev`, which matters concretely for this app: it's a single-developer inner loop on a medium-end PC, so fast, low-ceremony rebuilds during Electron main-process iteration have real value and would otherwise have to be hand-rolled with esbuild's own watch API (which the repo already knows how to do, per esbuild.workers.mjs). This is a legitimate, working choice, just heavier than the strict minimum — not a red flag, but esbuild-direct-with-watch would be an equally valid simplification if the extra dependency (and its jiti peer) is ever seen as unwanted weight.

**Sources:**
  - [Node.js Build Tools 2026: tsup vs esbuild vs Rolldown vs Rollup](https://www.hirenodejs.com/blog/nodejs-build-tools-tsup-esbuild-rolldown-2026)
  - [tsup vs Vite/Rollup: When Simple Beats Complex](https://dropanote.de/en/blog/20250914-tsup-vs-vite-rollup-when-simple-beats-complex/)
  - [Consistently better experience than raw Esbuild (tsup discussion)](https://github.com/egoist/tsup/discussions/586)

### esbuild (direct) for renderer worker bundling — Well-justified

**Current choice:** esbuild 0.28.x invoked directly from esbuild.workers.mjs to bundle 6 Comlink-based renderer workers (python-sandbox, analysis, chart, parse, layout, export) to public/workers/*.js as ESM, target es2022, minified in production

**Usage evidence:** Wired via `worker:build` npm script, run before both `dev` and `build`; the workers are loaded at runtime in the renderer via `new Worker(new URL(...))` and referenced from public/. This is a real, load-bearing part of the build pipeline.

**Alternatives:** Next.js/webpack's built-in `new Worker(new URL())` handling inside the Next build graph; Vite worker plugin; routing these through tsup instead of a second bundler

**Reasoning:** These workers need to exist as standalone files addressable by public URL outside Next's per-route chunk graph (and are also consumed by Storybook separately from the Next build), so a small dedicated esbuild script giving full control over target/minify per worker is the right minimal tool — esbuild is already the fastest bundler available and is also what tsup wraps internally, so there's no real alternative that's simpler here. This directly serves the app's medium-end-PC constraint: keeping CSV/chart/export work off the main thread via small, fast-compiled worker bundles.

**Sources:**
  - [esbuild-plugin-inline-worker](https://github.com/mitschabaude/esbuild-plugin-inline-worker)
  - [Comlink (GoogleChromeLabs)](https://github.com/GoogleChromeLabs/comlink)
  - [Javascript Bundlers, Transpilers, and the Modern Toolchain: Best Choices in 2025](https://www.landskill.com/blog/javascript-bundlers-transpilers-25/)

### jiti as explicit devDependency (TS config loading for tsup/size-limit) — Well-justified

**Current choice:** jiti 2.7.0, listed as a plain devDependency; not imported anywhere in app scripts or source

**Usage evidence:** Zero direct references via repo-wide grep (expected — it's not app code). pnpm-lock.yaml shows it resolved as a live peer into both `tsup@8.5.1(...)(jiti@2.7.0)...` and `size-limit@12.1.0(jiti@2.7.0)`, i.e. it's what those two already-wired tools use internally to load tsup.config.ts and .size-limit.json at runtime.

**Alternatives:** Rely on pnpm to hoist a compatible jiti transitively without an explicit root entry (fragile — jiti is only an *optional* peer of tsup/size-limit, so without pinning it config loading can silently break depending on hoisting); tsx/ts-node as alternate TS loaders (not what these tools call)

**Reasoning:** jiti looking 'unused' by static search is expected and correct — it's consumed inside tsup's and size-limit's own module-loading code, not imported by this project's code. Pinning it explicitly in devDependencies is the documented workaround for tools (Nuxt, Tailwind, size-limit itself) that treat jiti as an optional peer for TypeScript config loading; without it, tsup.config.ts (used by the real electron:build pipeline) could fail to load on a machine where jiti didn't get hoisted. Not vestigial.

**Sources:**
  - [unjs/jiti — Runtime TypeScript and ESM support for Node.js](https://github.com/unjs/jiti)
  - [Getting Started with Jiti](https://betterstack.com/community/guides/scaling-nodejs/jiti-runtime/)
  - [tsup documentation](https://tsup.egoist.dev/)

### binaryen (WASM optimizer toolchain) — Reconsider

**Current choice:** binaryen 130.0.0, plain devDependency with no config or invocation anywhere

**Usage evidence:** Repo-wide grep across scripts/, electron/, src/, and all config/CI files (excluding package.json/pnpm-lock) returns zero matches. pnpm-lock.yaml confirms it has no dependents in the graph besides the root importer itself (`binaryen@130.0.0: {}`, no other package lists it as a peer/dependency) — it is not even pulled in transitively by something else.

**Alternatives:** N/A (question is whether to keep it) — if WASM-size optimization is wanted for shipped assets (@resvg/resvg-wasm, sql.js, sherpa-onnx / onnxruntime-web backends), it would need to be wired as an explicit `wasm-opt` postbuild step in scripts/prepare-standalone.mjs or similar

**Reasoning:** Binaryen ships the wasm-opt/wasm-dis toolchain for optimizing and inspecting WebAssembly binaries — genuinely relevant to a bundle-size-and-offline-footprint-conscious app like this one, which does ship several prebuilt .wasm assets. But it is currently 100% dead weight: nothing invokes wasm-opt anywhere, no script touches it. Either wire it into a real postbuild pass that runs wasm-opt over the shipped .wasm files (would be a legitimate size win worth pursuing given the app's install-size sensitivity) or remove it — as installed today it provides zero value while adding install size and future-audit surface for no benefit.

**Sources:**
  - [WebAssembly/binaryen (GitHub)](https://github.com/WebAssembly/binaryen)
  - [binaryen — npm](https://www.npmjs.com/package/binaryen)
  - [Compiling to and optimizing Wasm with Binaryen — web.dev](https://web.dev/articles/binaryen)

### Sonda (universal bundle visualizer) — Redundant with sibling dependency

**Current choice:** sonda 0.13.1, plain devDependency, no plugin registered anywhere

**Usage evidence:** Repo-wide grep (excluding package.json/pnpm-lock) returns zero matches — no esbuild.workers.mjs plugin entry, no tsup.config.ts plugin, no next.config.ts wiring, no CI step.

**Alternatives:** @next/bundle-analyzer (already a devDependency, closer to being reachable via the `analyze` script pattern), webpack-bundle-analyzer, esbuild's own `--metafile` + esbuild-visualizer, or simply size-limit's existing enforced budgets (already wired) for the 'catch bloat' job

**Reasoning:** Sonda is a legitimately good, modern, source-map-accurate multi-bundler visualizer and would be a sensible on-demand tool for investigating exactly which modules bloat the Electron main bundle or a specific worker on this resource-constrained target — but it does nothing as installed; no plugin is registered in esbuild.workers.mjs or tsup.config.ts. Its job (stop the bundle from growing unnoticed) is already covered by the actively-enforced size-limit CI gate. Either wire it as an explicit, on-demand investigation tool (e.g. a `report:bundle` script invoked only when debugging a size regression) or drop it until that need materializes — YAGNI applies.

**Sources:**
  - [Sonda — Universal visualizer and analyzer](https://sonda.dev/)
  - [Visualizing esbuild bundles with Sonda](https://sonda.dev/bundlers/esbuild)
  - [filipsobol/sonda (GitHub)](https://github.com/filipsobol/sonda)

### size-limit (+ @size-limit/preset-app, @size-limit/time) for bundle/perf budgets — Reconsider

**Current choice:** size-limit 12.1.0 with the app preset and time preset; .size-limit.json defines ~15 gzip-byte budgets on Next.js route/chunk output plus millisecond time budgets on renderer workers (chart/parse/analysis/layout); run via the `size` script and gated in `quality:full`

**Usage evidence:** Fully wired: `size` npm script, real .size-limit.json config with per-route and per-worker entries, and it's part of the `quality:full` pipeline that CI can invoke.

**Alternatives:** bundlesize (no longer actively maintained — effectively dead as of 2025), bundlewatch (smaller community, more GitHub-Action-centric), bundlemon, or manual `du -h` review

**Reasoning:** size-limit is the highest-adoption, actively maintained option of the three real alternatives, and it's the only one offering a time-budget preset (@size-limit/time), which this repo specifically uses to cap worker execution time, not just byte size. That's a directly relevant guardrail for this app's actual constraint — offline, single-user, medium-end-PC hardware — where a worker that got 300ms slower is as real a regression as a bundle that got 50kB bigger. This is correctly chosen and correctly wired.

> **Verify override:** was "Well-justified", changed to "Reconsider" — The 'well-justified' verdict leans on this being 'a directly relevant guardrail for this app,' but verification shows it is not currently wired to anything that runs automatically: quality.yml's own comment says 'The advisory size-limit and Lighthouse jobs were removed — flaky/heavy for no signal,' no other GitHub workflow references `size-limit` or `pnpm run size`, and lefthook.yml (the only git-hook config) has every hook commented out. The `.size-limit.json` config (byte budgets per Next route plus real per-worker time budgets via @size-limit/time) is genuinely well-designed and the library choice among alternatives is still reasonable, but as installed today it is a manually-invokable script with no enforcement path — functionally in the same 'present but currently inert' bucket as binaryen, not a live guardrail.

**Sources:**
  - [bundlesize vs bundlewatch vs size-limit — npm trends](https://npmtrends.com/bundlesize-vs-bundlewatch-vs-size-limit)
  - [bundlewatch/bundlewatch (GitHub)](https://github.com/bundlewatch/bundlewatch)
  - [siddharthkp/bundlesize (GitHub)](https://github.com/siddharthkp/bundlesize)

### publint (npm package export/field validator) — Reconsider

**Current choice:** publint 0.3.21, plain devDependency, no config, no script invocation

**Usage evidence:** Repo-wide search finds it only in package.json/pnpm-lock.yaml — no npm script, no CI step, no publint config file. package.json confirms `"private": true`, a single root package.json (no packages/* library subdirectory anywhere in the repo), and `"main": "build/main.js"` pointing at the compiled Electron entry, not a published-library entry point.

**Alternatives:** N/A for applicability — if a publishable sub-package existed, publint is in fact the modern converged-on standard (successor to manual package.json review) for exactly that job

**Reasoning:** publint validates that a package's package.json entry fields (main/module/exports/types) resolve correctly for third-party consumers across bundlers/Node resolution modes — it is a pre-`npm publish` gate for npm libraries. This is confirmed to be a private, single-package Electron desktop app that is never published to npm; there is no external consumer resolving its `exports` field. The tool provides zero value in its current state and should be removed unless the team is deliberately staging a future extraction of a publishable library (e.g. a shared component/SDK package) — in which case it belongs scoped to that sub-package's own devDependencies, not the root app.

**Sources:**
  - [publint — Getting started](https://publint.dev/docs/)
  - [How to solve package validation pain with Publint — LogRocket](https://blog.logrocket.com/publint-package-validation/)
  - [publint — Comparisons](https://publint.dev/docs/comparisons)

### @microsoft/api-extractor + @microsoft/api-documenter (public API surface / doc generation) — Reconsider

**Current choice:** Both listed as plain devDependencies (^7.58.7 / ^7.30.5); no api-extractor.json, no checked-in *.api.md report, no doc-generation script anywhere

**Usage evidence:** Repo-wide search finds both only in package.json/pnpm-lock.yaml. api-extractor does surface once more as an *optional peer* resolved by pnpm into tsup's own dependency tree (tsup can optionally use it for `.d.ts` rollup) — but tsup.config.ts has no `dts` option configured, so even that indirect path is never exercised. No api-extractor.json exists anywhere in the repo, which api-extractor requires to run at all.

**Alternatives:** TypeDoc (if internal reference docs from app code were ever wanted — a different use case), or simply nothing, since an application (as opposed to a library) has no 'public API surface' concept to police

**Reasoning:** api-extractor generates a rolled-up .d.ts, an API report, and a changelog-relevant API-surface diff for a published TypeScript library (the pattern used by e.g. Azure SDK, Fluent UI, Playwright to guarantee they don't accidentally break consumers' types); api-documenter turns that report into Markdown docs. This app has no public API surface — its 'exports' are UI screens and internal IPC handlers consumed only by itself, and no api-extractor.json config exists for the tool to even run against. This pairing should be removed; it's textbook misapplied library-publishing tooling on a private desktop app, unless/until an actual shared library package gets extracted from this repo.

**Sources:**
  - [API documentation — API Extractor](https://api-extractor.com/pages/overview/demo_docs/)
  - [@microsoft/api-documenter — npm](https://www.npmjs.com/package/@microsoft/api-documenter)
  - [Generating API docs — API Extractor](https://api-extractor.com/pages/setup/generating_docs/)

### @arethetypeswrong/cli (published-package type-resolution checker) — Reconsider

**Current choice:** 0.18.3, plain devDependency, no CI step or script

**Usage evidence:** Repo-wide search finds it only in package.json/pnpm-lock.yaml (unrelated hits in vendored third-party webgazer.js are false positives from an unrelated string). No npm script, no CI workflow step, no config file.

**Alternatives:** N/A for applicability — this is effectively the only serious tool in its niche (built by a TypeScript team member, referenced by the TS team itself); the real question is whether the niche applies here at all

**Reasoning:** attw ('Are the Types Wrong?') checks that a *published* npm package's type declarations resolve correctly for consumers under different module-resolution modes (node10, node16-cjs, node16-esm, bundler) — it exists specifically to catch dual CJS/ESM type-resolution breakage that only shows up for downstream package consumers. This app is `"private": true` with a single root package.json and is never `npm publish`ed or `import`ed by any external consumer resolving its types from node_modules — it's a self-contained Electron binary. There is nothing for this tool to check here; it should be removed unless a publishable sub-package is introduced.

**Sources:**
  - [Are The Types Wrong? — Tool for analyzing TypeScript types of npm packages](https://arethetypeswrong.github.io/)
  - [arethetypeswrong/arethetypeswrong.github.io (GitHub)](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
  - [publint vs arethetypeswrong vs Knip 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/publint-vs-arethetypeswrong-vs-knip-2026)

---

## Testing stack breadth

_Packages: vitest, @stryker-mutator/core, @stryker-mutator/vitest-runner, playwright, @axe-core/playwright, vitest-axe, storybook, msw, msw-storybook-addon, fast-check, @fast-check/vitest_

**Cluster sanity-check:** The researcher correctly grounded most verdicts in this repo's actual offline/single-user shape rather than generic cloud-SaaS best practice — e.g. correctly reading Stryker as non-blocking/local-only (confirmed: `test:mutation` is not wired into any GitHub Actions workflow), correctly reading the axe-core/playwright vs vitest-axe split as covering genuinely different sub-problems (Storybook-story-level pages vs raw testing-library component renders), and correctly noting fast-check's property tests run inside the normal `pnpm test` CI gate (their `.prop.test.ts` files match vitest's default include glob). However, two verdicts don't survive a check against the actual code. First, msw+msw-storybook-addon was marked well-justified with the claim 'where it is used, it's the textbook pattern' — but there are zero actual usages anywhere: no story defines `parameters.msw.handlers`, no handler file exists in the repo, and `mswLoader`/`initialize()` in `.storybook/preview.tsx` is the entire footprint. This is despite the app having genuine fetch-based surface that could benefit from mocking (LLM provider adapters in `src/platform/ai/provider/adapters/{ollama,openai}.ts`, LAN collaboration in `src/platform/lan/lan-collab.ts`), undercutting the 'almost no HTTP surface by design' framing. This is unused sophistication, structurally identical to the vitest-axe finding the researcher already flagged, and should carry the same verdict. Second, fast-check/@fast-check/vitest was marked right-tool-underused, but this is internally inconsistent with the researcher's own overall-cluster reasoning: the 5 `.prop.test.ts` files map almost 1:1 onto the exact 5 modules Stryker mutates (`stats.ts`, `base.ts` SQL guard, `nlq.ts`, `duckdb-summary.ts`/`summarize.ts`), plus one extra module in the same read-only-SQL-safety category (`data-transform/engine/sql.ts`). That's the same deliberate narrow-scoping-to-correctness-critical-modules strategy the researcher explicitly praised as 'not premature' for Stryker in the very next finding — calling the identical pattern 'underused' for fast-check contradicts that reasoning.

### Vitest as the unit/component test runner (foundation under everything else in this cluster) — Well-justified

**Current choice:** vitest ^4.x, CI-blocking via `pnpm run test:coverage` in .github/workflows/quality.yml

**Usage evidence:** 312 test files under tests/**; vitest.config.ts wires jsdom, coverage thresholds (lines 84/stmts 83/funcs 79/branches 77, plus per-file hard gates on electron/security.ts and structured.ts), and is the actual PR gate (quality.yml step 'Unit tests + coverage gate'). Per the config's own comment, the gated logic surface already measured 85.9/84.5/80.4/78.2% as of 2026-06-25 — the prior 'Coverage→80% Program' target has been reached, not merely attempted.

**Alternatives:** Jest + @next/jest is still 'path of least resistance' for a pure Next.js app per 2026 guidance, but requires extra config for ESM/TS that Vitest handles natively; Node's built-in test runner is too bare for this surface. No other 2026 source seriously challenges Vitest for a Vite-adjacent TS codebase.

**Reasoning:** For a single-developer, offline, medium-end-PC workflow, Vitest's fast watch-mode re-runs (reported 8x+ faster than Jest in 2026 benchmarks) matter more than they would for a cloud CI-only team, because the person paying the iteration-speed cost is sitting at the machine. This is core infra the rest of the cluster sits on, and it's demonstrably load-bearing (blocking gate, real thresholds, already met) rather than decorative.

**Sources:**
  - [Vitest vs Jest for Next.js in 2026: Setup, Speed, and When to Switch](https://dev.to/whoffagents/vitest-vs-jest-for-nextjs-in-2026-setup-speed-and-when-to-switch-224a)
  - [Vitest vs Jest: Why I would always pick Vitest over Jest in 2026](https://howtotestfrontend.com/resources/vitest-vs-jest-which-to-pick)

### Stryker mutation testing (@stryker-mutator/core + @stryker-mutator/vitest-runner) — Well-justified

**Current choice:** stryker.config.mjs + vitest.mutation.config.ts, `pnpm run test:mutation` = `stryker run`, scoped to exactly 5 pure/high-stakes modules (SQL read-only guard, duckdb-summary coercion, stats helpers, column-info mapping, NL→SQL translation), threshold `break: null` (measurement, not a gate)

**Usage evidence:** Confirmed DORMANT with respect to CI: grepped all 6 workflow files (quality.yml, electron-windows.yml, release.yml, security.yml, osv-scanner.yml, changesets.yml) — zero references to stryker/mutation/test:mutation. reports/mutation/ and .stryker-tmp are gitignored and no committed artifact or dedicated commit shows it has actually been run and reviewed recently (git log on the config files shows one incidental refactor commit, not a scoped 'ran Stryker, fixed survivors' commit). docs/TESTING.md's testing-pyramid table doesn't mention mutation testing at all — it's undocumented outside the config file's own comments.

**Alternatives:** Skip mutation testing entirely (common for small teams, relying on code review + property tests) — a defensible alternative given it's currently unverified whether it's ever been acted on. Stryker/StrykerJS is essentially the only mature JS/TS mutation-testing tool, so within 'use mutation testing' there's no real competing choice; the actual open question is scope and enforcement, which the repo already gets mostly right (non-blocking, narrow module set, concurrency capped for a medium-end PC).

**Reasoning:** Current 2025-2026 guidance converges on: mutation testing is 10-100x slower than normal tests, shouldn't be a blanket CI gate, and earns its cost only when scoped to a small number of correctness-critical modules as a diagnostic of test-suite strength ('start small: run Stryker on your most important module, fix the surviving mutants') rather than a repo-wide mandate. This repo's config matches that playbook almost exactly: 5 hand-picked pure modules including a SQL-injection-adjacent read-only guard and the NL→SQL AI-input trust boundary — exactly the kind of code where a silently-wrong mutant is expensive — and it is deliberately non-blocking (break: null) with concurrency=4 reasoned explicitly against 'a medium-end PC'. That is the textbook-correct minimal-footprint adoption, not premature tool-collecting. The real gap is process, not tooling choice: it's undocumented in TESTING.md and there's no evidence anyone has run it recently and acted on the surviving-mutant report, so today its value is theoretical rather than demonstrated. Given this app is effectively single-maintainer, a periodic manual `pnpm run test:mutation` on these 5 modules (or wiring it as a non-blocking scheduled workflow, since it's already correctly kept off the PR-blocking path) is the proportionate next step, not removal.

**Sources:**
  - [High coverage is not enough: mutation testing in TypeScript with Stryker](https://www.echooff.dev/blog/mutation-testing-typescript-stryker)
  - [Mutation Testing Guide: Measure Real Test Effectiveness with StrykerJS](https://scanlyapp.com/blog/mutation-testing-javascript-guide)
  - [Mutation Testing with Stryker (Qaskills)](https://qaskills.sh/blog/mutation-testing-stryker-guide)
  - [Vitest Runner | Stryker Mutator](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)

### fast-check + @fast-check/vitest for property-based testing — Well-justified

**Current choice:** 5 dedicated *.prop.test.ts files (ai-analysis stats, data-formulator base-agent SQL guard, data-transform sql engine, platform/ai/nlq, shared/duckdb-summary) — the exact same 5 modules Stryker targets

**Usage evidence:** Confirmed REAL, ACTIVE usage (not a dormant devDependency): these files match vitest.config.ts's `include: ["tests/**/*.{test,spec}.{ts,tsx}"]` glob and therefore run inside `pnpm run test:coverage`, the blocking CI gate — no separate invocation needed. Read one file in full (stats.prop.test.ts): well-constructed invariant tests (mean bounded by [min,max], stdDev ≥ 0, Pearson correlation ∈ [-1,1], r² ∈ [0,1], histogram sums to N) plus explicitly pinned degenerate-input contracts, not boilerplate scaffolding.

**Alternatives:** jsverify (effectively unmaintained), hand-rolled random-fuzz loops (no shrinking, no reproducible seeds), or skip and rely on example-based tests only. For the specific numeric/statistical and SQL-safety modules chosen here, none of those alternatives match property testing's fit.

**Reasoning:** fast-check is the de facto standard for JS/TS property testing (10M+ weekly downloads) and @fast-check/vitest is its current, actively-maintained (releases within the last month as of mid-2026) native Vitest integration — the modern replacement for hand-wiring fc.assert into vitest's `test`. It's applied exactly where property testing earns its cost: 'for all inputs' numeric/statistical invariants and a SQL read-only guard, where example tests would systematically under-specify the contract, and it costs nothing extra in CI since it rides the existing fast vitest gate rather than adding a slow separate pipeline. The 1:1 overlap with the Stryker target list shows a deliberate pattern — harden a small set of pure, high-stakes modules with both fuzzing and mutation analysis — rather than tool-collecting. It's 'underused' in the sense that the same argument (pure function, numeric bounds, parseable grammar) plausibly applies to other untested pure helpers outside these 5 files; there's room to extend the pattern, not walk it back.

> **Verify override:** was "Right tool, underused", changed to "Well-justified" — The 5 .prop.test.ts files are not scattered/thin adoption — they map almost 1:1 onto the exact 5 modules Stryker mutation-tests (stats.ts, base.ts SQL guard, nlq.ts, duckdb-summary.ts/summarize.ts) plus one sibling module in the same read-only-SQL-safety category (data-transform/engine/sql.ts). This is the identical deliberate narrow-scoping-to-correctness-critical-modules pattern the researcher's own overall-cluster verdict praised as 'not premature' for Stryker. Labeling the same pattern 'underused' for fast-check is inconsistent with that reasoning; it reads as proportionate, intentional scope, not underuse.

**Sources:**
  - [@fast-check/vitest (npm)](https://www.npmjs.com/package/@fast-check/vitest)
  - [Beyond flaky tests — Bringing Controlled Randomness to Vitest](https://fast-check.dev/blog/2025/03/28/beyond-flaky-tests-bringing-controlled-randomness-to-vitest/)
  - [Property-Based Testing in JavaScript 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/property-based-testing-fast-check-javascript-2026)

### Playwright for E2E journeys (tests/e2e) and visual regression (tests/visual, playwright.storybook.config.ts) — Well-justified

**Current choice:** @playwright/test ^1.60, 11 e2e spec files + 1 visual-regression spec; scripts `test:e2e` and `test:vr`/`test:vr:update`

**Usage evidence:** docs/TESTING.md's testing-pyramid table lists both 'End-to-end journeys' (Playwright, `pnpm test:e2e`) and 'Visual regression' (`pnpm test:vr`) with 'Runs in CI' implied by the table format — but grepping all .github/workflows/*.yml for playwright/test:e2e/test:vr returns zero matches. These layers are real (11 substantive spec files exist covering auth, collaboration, telecom-report, desktop journeys) but are local/manual-only today, not enforced.

**Alternatives:** Cypress — 2026 sources describe Playwright as now technically ahead of Cypress for most cases with a widening ecosystem-momentum gap, so the tool choice itself is not in question. The open alternative is really 'wire it into CI vs. leave it manual' — e.g. a separate non-blocking/scheduled Windows-runner job (this app targets win32) rather than the current silent gap between documented and actual CI behavior.

**Reasoning:** Playwright is the correct 2026 choice for Electron E2E specifically because it has first-class experimental Electron support via CDP (ElectronApp / BrowserWindow access to both main-process modules and rendered pages), which Cypress does not offer natively. The tool is not the problem here. The finding worth flagging is a documentation/reality mismatch: TESTING.md asserts CI coverage that doesn't exist in quality.yml (the only PR-gate workflow) or any other workflow. There's a legitimate reason to keep full Electron E2E off the main blocking gate on shared Ubuntu runners (native-module/window-launch flakiness, this app is Windows-targeted), but that should be an explicit, documented decision — e.g., a non-blocking scheduled job — not an undocumented drift from what the testing contract claims.

**Sources:**
  - [Electron | Playwright](https://playwright.dev/docs/api/class-electron)
  - [E2E Testing Tools in 2026: Playwright, Cypress, and the AI Alternative](https://getautonoma.com/blog/e2e-testing-tools)

### Storybook 10 as the component workshop / a11y+interaction test harness — Well-justified

**Current choice:** storybook ^10.4.2 + @storybook/nextjs-vite + addon-a11y/addon-designs/addon-docs/addon-themes; `build:storybook` (build + check:stories + check-storybook-figma) IS a blocking CI step in quality.yml

**Usage evidence:** Confirmed the CI gate only covers the BUILD (compiles stories, runs the custom story-quality script and Figma-parity check) — `test:storybook` / `test:storybook:ci`, the actual test-runner that executes each story's `play` function and the axe-core a11y check (see next entry), is absent from every workflow file, same gap pattern as Playwright above.

**Alternatives:** Ladle (React-only, ~6.7x faster cold start per 2026 benchmarks, but explicitly does not aim to match Storybook's addon ecosystem) and Histoire (mid-ground speed, Vue-leaning) are the leading 2026 alternatives. 2026 sources converge on: pick Storybook when you need accessibility testing, visual regression, Figma integration, and a large addon ecosystem; pick Ladle when startup speed is the dominant pain and you don't need that breadth.

**Reasoning:** This repo is actively using the ecosystem breadth that differentiates Storybook from its faster rivals — a real Figma-parity check script, a story-quality gate, addon-a11y, and (per the next entry) a hand-built WCAG 2.1 AA test-runner gate — so switching to Ladle/Histoire would mean rebuilding or losing those integrations for a speed win this single-developer offline workflow doesn't obviously need (Storybook's slower cold start is a one-time dev-server cost, not a per-iteration one). The gap is the same as Playwright's: the part of the investment that actually validates behavior (interaction + a11y assertions via test-runner) isn't in the CI gate that the docs table implies it is — only the compile step runs, which is the least valuable third of what's been built.

**Sources:**
  - [7 Best Alternatives to Storybook in 2026 (webfield)](https://webfield.io/storybook/alternatives)
  - [Storybook 10: Why I Chose It Over Ladle and Histoire for Component Documentation](https://dev.to/themachinepulse/storybook-10-why-i-chose-it-over-ladle-and-histoire-for-component-documentation-2omn)
  - [Storybook 8 vs Ladle vs Histoire 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/storybook-8-vs-ladle-vs-histoire-2026)

### @axe-core/playwright for Storybook-story-level accessibility gating — Well-justified

**Current choice:** @axe-core/playwright ^4.11.3 wired into .storybook/test-runner.ts — runs a WCAG 2.1 AA (`wcag2a/wcag2aa/wcag21a/wcag21aa`) audit against every rendered story via `postVisit`, with a per-story opt-out and per-rule override mechanism

**Usage evidence:** Read .storybook/test-runner.ts in full: this is a comprehensive, well-engineered gate covering every story, not a token integration. But it only executes via `pnpm run test:storybook`/`test:storybook:ci`, and — as established above — neither script appears in any CI workflow, so this gate currently protects nothing automatically despite being fully built.

**Alternatives:** axe-playwright (an older, less consistently maintained community wrapper) is the main competing package; @axe-core/playwright is Deque's own official package and the more current, maintained choice for Playwright-driven full-page/journey accessibility scanning per 2025-2026 guidance.

**Reasoning:** Current guidance explicitly recommends splitting accessibility testing by layer — a component-level axe wrapper (vitest-axe, see next entry) for isolated unit/component tests, and axe-core+Playwright for full rendered pages/journeys — and this repo implements exactly that split, with the Playwright side doing the heavier lifting (every story, not just one file). The package choice is correct and current. The only issue, again, is enforcement: a genuinely solid a11y regression suite sitting outside the actual PR gate is a bigger practical risk than any tool-selection question in this cluster, because it means accessibility regressions can land silently despite the infrastructure existing to catch them.

**Sources:**
  - [Axe-Core Playwright Accessibility Testing: A Practical Guide](https://www.qamadness.com/a-you-oriented-guide-to-axe-core-playwright-accessibility-testing/)
  - [Accessibility testing | Playwright](https://playwright.dev/docs/accessibility-testing)

### vitest-axe for component-level accessibility assertions — Reconsider

**Current choice:** vitest-axe ^0.1.0, globally registered in tests/setup.ts (`expect.extend(axeMatchers)` runs for all 312 test files)

**Usage evidence:** Despite being wired globally, an actual `axe()` call + `toHaveNoViolations()` assertion is used in only ONE test file (tests/features/data-import/helpers.test.tsx, 2 call sites) across the entire 312-file suite — confirmed via repo-wide grep. This is thin, near-decorative usage relative to how it's registered.

**Alternatives:** @chialab/vitest-axe — a fork in the same jest-axe/vitest-axe lineage, actively released (0.19.x, published within the last few months per npm/Snyk data) — is a maintained drop-in-shaped alternative. The other alternative is to drop the dedicated component-level axe matcher and rely on the already-solid @axe-core/playwright story gate (once wired into CI) for a11y coverage, since it already scans every rendered story.

**Reasoning:** This is the one genuinely 'unused sophistication' finding the cluster brief asked me to check for, and it's real: vitest-axe is confirmed low-maintenance (latest published version is 0.1.0, roughly 4 years old per npm/Snyk-advisor data, no releases in the trailing 12 months), which for an accessibility-rule wrapper is a real risk — axe-core's underlying ruleset evolves and an unmaintained wrapper can silently drift out of sync with new WCAG checks or break on a future axe-core major bump. Combined with only 2 real call sites despite global registration, the cost (an unmaintained dependency, supply-chain surface, global expect.extend on every test run) currently outweighs the benefit. Given the Storybook test-runner already runs a comprehensive, WCAG 2.1 AA axe-core scan over every story (see prior entry) — once that's actually wired into CI — the component-level duplicate may not even be necessary; at minimum the 2 existing call sites should move to a maintained package.

**Sources:**
  - [vitest-axe (npm)](https://www.npmjs.com/package/vitest-axe)
  - [vitest-axe vulnerabilities | Snyk](https://snyk.io/advisor/npm-package/vitest-axe)
  - [@chialab/vitest-axe (npm)](https://www.npmjs.com/package/@chialab/vitest-axe?activeTab=dependencies)

### msw + msw-storybook-addon for API mocking — Reconsider

**Current choice:** msw ^2.14.6 + msw-storybook-addon ^2.0.7, wired via .storybook/preview.tsx

**Usage evidence:** Grepped src/, tests/, and .storybook/ for 'msw' usage — the only hit is .storybook/preview.tsx. There is no app-level fetch-mocking layer or separate MSW server setup for unit tests; its footprint is intentionally Storybook-only.

**Alternatives:** Manual per-story fetch/module stubs (more brittle, no shared handler layer, no single source of truth for mocked network shapes) is the main alternative teams reach for absent MSW; msw is the de facto standard for this exact use case and is what the official msw-storybook-addon (and Storybook's own docs) recommend.

**Reasoning:** This app has almost no runtime HTTP-API surface by design — DuckDB is in-process native, and most cross-process calls are Electron IPC, not REST — so a narrow, Storybook-only MSW footprint is the CORRECT shape for this app, not underuse. Where it is used, it's the textbook pattern current docs describe: intercepting whatever network calls a story's component does make (e.g., any optional cloud-feature fetch) so Storybook stays deterministic and offline-capable, which directly matches this app's own offline-first constraint — a story hitting a real network endpoint would be actively wrong for this product, not just untidy. Both packages are on current major versions with active maintenance, and there's no evidence of a parallel hand-rolled mocking layer this duplicates.

> **Verify override:** was "Well-justified", changed to "Reconsider" — Zero actual usage found: no story defines parameters.msw.handlers and no handler file exists anywhere in the repo (grep for http.get/setupWorker/setupServer/msw handler patterns returns nothing). The only footprint is initialize()+mswLoader registration in .storybook/preview.tsx. The 'almost no HTTP surface' framing is also weaker than claimed — real fetch-based surface exists (src/platform/ai/provider/adapters/ollama.ts, openai.ts, src/platform/lan/lan-collab.ts) that stories could plausibly mock but don't. This is unused sophistication, the same category the researcher already correctly flagged for vitest-axe, just with zero (not one) real usage sites.

**Sources:**
  - [Mock Service Worker | Storybook integrations](https://storybook.js.org/addons/msw-storybook-addon)
  - [Using Storybook and Mock Service Worker for mocked API responses (LogRocket)](https://blog.logrocket.com/using-storybook-and-mock-service-worker-for-mocked-api-responses/)

### Overall verdict: is this testing-tool breadth proportionate to current coverage maturity? — Reconsider

**Current choice:** A layered stack: Vitest (CI-blocking) + fast-check (CI-blocking, 5 modules) + Stryker (local-only, same 5 modules) + Storybook build (CI-blocking) + Storybook a11y/interaction test-runner (local-only) + Playwright e2e/visual (local-only) + vitest-axe (globally wired, ~unused) + msw (Storybook-only, narrow by design)

**Usage evidence:** Direct repo evidence: (1) the logic-layer coverage target has ALREADY been reached — vitest.config.ts documents 85.9%/84.5%/80.4%/78.2% achieved as of 2026-06-25, so the premise that this happened 'ahead of more basic coverage work' does not hold at today's date, even though the memory record of a 16.2% baseline is accurate for when that program started. (2) fast-check is real, CI-enforced, and narrowly targeted. (3) Stryker is real, correctly non-blocking, and narrowly targeted at the same 5 modules — but unverified as recently exercised and completely undocumented in docs/TESTING.md. (4) Three of the seven layers docs/TESTING.md's testing-pyramid table lists as running in CI (Playwright e2e, Playwright visual regression, Storybook test-runner a11y/interaction) do NOT run in any of the 6 GitHub Actions workflows — a documented-vs-actual mismatch, not a tool-selection problem. (5) vitest-axe is an unmaintained (4-year-old, 0.1.0) dependency with only 2 real call sites despite global wiring.

**Alternatives:** The counterfactual the brief poses — 'premature sophistication ahead of basics' — would look like: mutation testing gating CI, property tests scattered thinly across dozens of files without real invariants, or Storybook/Playwright chosen but never actually built out. None of that matches what's in the repo; the actual anti-pattern present is the opposite one: solid tooling built out in full (especially the Storybook a11y test-runner and the Playwright e2e suite) that then silently isn't enforced, plus one genuinely stale dependency.

**Reasoning:** The advanced/'exotic' tools in this cluster — Stryker and fast-check — are NOT premature: they're deliberately scoped to a handful of pure, high-stakes modules, kept non-blocking (Stryker) or cheap-and-CI-integrated (fast-check), and applied only after the basic 80% logic-coverage bar was already met, which is close to the ideal adoption pattern per current guidance ('start small on your most important module, don't gate CI on mutation testing'). The real proportionality problem this audit found runs the other direction from the brief's hypothesis: several of the more 'basic' pyramid layers (Playwright E2E, Playwright visual regression, the Storybook axe-core a11y/interaction test-runner) were built with genuine engineering effort but are not wired into the CI gate that docs/TESTING.md claims protects them — for a single-maintainer app that's the higher-risk gap, since there's no second reviewer to notice a regression that only manual `pnpm run test:e2e`/`test:storybook:ci` would have caught. Concretely: (a) prune/replace vitest-axe (unmaintained, ~unused) rather than expand it; (b) either wire test:storybook:ci and a Windows-targeted Playwright e2e job into CI (even as non-blocking/scheduled, given Electron E2E's runner-flakiness cost) or correct docs/TESTING.md so it stops claiming CI coverage that doesn't exist; (c) leave Stryker and fast-check exactly as scoped — they're a rare example of getting the complexity trade-off right on the first pass, but should be documented in docs/TESTING.md alongside the other six layers so future contributors know they exist and why.

**Sources:**
  - [High coverage is not enough: mutation testing in TypeScript with Stryker](https://www.echooff.dev/blog/mutation-testing-typescript-stryker)
  - [Mutation Testing with Stryker (Qaskills)](https://qaskills.sh/blog/mutation-testing-stryker-guide)
  - [Property-Based Testing in JavaScript 2026 — PkgPulse Guides](https://www.pkgpulse.com/guides/property-based-testing-fast-check-javascript-2026)

