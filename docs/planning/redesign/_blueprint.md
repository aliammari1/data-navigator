# DATA NAVIGATOR — REDESIGN BLUEPRINT v2
**"Cockpit & Cinéma"** — one calm, French-first telecom cockpit wrapped in cinematic entry surfaces.

Doctrine for interpreting the owner's brief on medium-end hardware: **"parallax and complex flows everywhere" splits into two zones.** *Cinéma* surfaces (landing, home hero band, Analytics Theater, first-run welcome) get scroll-driven depth, staggered reveals, and 3D tilt — all compositor-only (`transform`/`opacity`, CSS `animation-timeline: view()`). *Cockpit* surfaces (telecom report, grids, analysis) get restrained micro-motion: one staggered entrance per session, count-ups, spotlight borders, spring presses — and **zero parallax**, per NN/g guidance for task-focused tools. "Complex flows" is delivered as a **guided golden path with explicit next-step affordances on every screen**, not as decorative complexity.

---

## 1. FEATURE DISPOSITION TABLE

Every feature folder and route, resolved decisively.

| Feature / Route | Disposition | Reason |
|---|---|---|
| `telecom` → `/dashboard/telecom-report/*` (8 tabs) | **KEEP (flagship)** | The product core; everything orbits the DailyTransactions report. Sub-tabs move from sidebar into an in-page tab rail (§2). |
| `data-formulator` → `/dashboard/data-formulator` | **KEEP (flagship)** | Most ambitious surface (NL→SQL, agents, voice, RAG). Becomes the single "Studio IA". Absorbs agent-canvas. Its briefing agent is rewired to call the `ai-briefing` engine. |
| `agent-canvas` → `/dashboard/agent-canvas` | **MERGE-INTO data-formulator, then DELETE route** | 3.3× smaller duplicate of data-formulator's AI-built-dashboard concept. Port the agent DAG trace view + AG-UI event log as a "Trace" panel inside data-formulator; redirect route. |
| `ai-analysis` → `/dashboard/ai-analysis` | **KEEP — amputate forecast tab** | Deterministic stats suite is distinct. Its forecast tab duplicates `forecast-intelligence`; replace with a card linking to `/dashboard/forecast`. |
| `ai-briefing` → `/dashboard/ai-briefing` | **KEEP** | Only LLM-narrative + TTS-narration surface; becomes the canonical briefing engine consumed by data-formulator too. |
| `analytics-theater` → `/dashboard/analytics-theater` | **KEEP** | The legitimate scrollytelling/cinema surface — the natural home for the owner's parallax appetite. Route its exports through the shared export worker. |
| `channel-monitor` → `/dashboard/monitor` | **KEEP** | Real ops engine. Demo fallback stays but gets a prominent "Données de démonstration — Importer" banner with upload CTA. |
| `collaboration` → `/dashboard/collaborative` | **KEEP as merge base → new route `/dashboard/collaboration`** | Cleaner CRDT substrate (`lib/room*`). Receives collab-hub's approval workflow + section annotations + audit. Old route redirects. |
| `collab-hub` → `/dashboard/collab-hub` | **MERGE-INTO collaboration, then DELETE** | Near-identical Yjs/LAN workspace; its approval workflow and report annotations are the only unique parts — port them, redirect route. |
| `csv-parser` → `/dashboard/csv-parser` | **MERGE-INTO data-import, then DELETE route** | Parallel competing import pipeline. Becomes "Analyse avancée" mode inside Upload (delimiter/type/filter controls, paste-text). Redirect to `/dashboard/upload?mode=advanced`. |
| `dashboard-home` → `/dashboard` | **KEEP — rebuild as Mission Control** | Becomes the hub: KPI hero, continue-where-you-left-off, launcher grid, activity rail (§3, §6). Stops fully duplicating telecom OverviewTab; summarizes + links. |
| `dashboard-shell` (infra) | **KEEP** | Shell is rebuilt in Wave 1. **DELETE** legacy `components/sidebar-nav.tsx` + stories. |
| `dashboard-shell` diagnostics → `/dashboard/dashboard-shell` | **MERGE-INTO settings (EXPOSE)** | Real, useful runtime diagnostics; becomes Settings → "Diagnostics système" panel. Redirect old route. |
| `data-browser` → `/dashboard/data-browser` | **EXPOSE (add to nav)** | Only generic any-dataset browser, complete, 4.5k LOC; hiding it is the worst option. Nav: Données → "Explorateur". |
| `/dashboard/browser` | **DELETE** | Inferior hardcoded-table duplicate of telecom grid; bypasses runtime provider, swallows errors. Redirect to `/dashboard/telecom-report/grid`. Fix Help/tour references. |
| `data-import` → `/dashboard/upload` | **KEEP (primary import)** | The wired pipeline (validation, history, batch, Electron dialogs). Gains drag-and-drop, telecom auto-routing, and csv-parser's advanced mode. |
| `data-transform` → `/dashboard/transform` | **KEEP** | Complete, unique ETL builder. Moves under the Données group. |
| `deep-analytics` → `/dashboard/deep-analytics` | **KEEP** | Unique heavy statistics (cohorts, attribution, k-means, Welch t-test). **DELETE** its dead `components/ReconciliationWizard.tsx`; retokenize hardcoded slate colors. |
| `folders` → `/dashboard/folders` | **KEEP — relabel "Catalogue"** | Unique dataset organizer; becomes the catalog entry of the Données hub. |
| `forecast-intelligence` → `/dashboard/forecast` | **KEEP (canonical forecasting)** | Real DuckDB + optional Pyodide pipeline; ai-analysis's forecast tab redirects here. |
| `geo-analysis` → `/dashboard/geo-analysis` | **KEEP** | Unique offline MapLibre/PMTiles surface. |
| `help` → `/dashboard/help` | **KEEP — rewrite content** | Fix contradictory copy, broken tour step, links to deleted routes; gains "Progression" tab (achievements from ux-innovations). |
| `history` → `/dashboard/history` | **KEEP — relabel "Journal d'activité"** | Distinct from telecom analyses cache; relabel kills the naming collision. |
| `lineage` → `/dashboard/lineage` | **KEEP** | Unique column-lineage graph. Keep its in-feature ELK worker; delete the shadowed ELK path in shared `layout.worker.ts`. |
| `parsed-data` → `/dashboard/parsed` | **KEEP — relabel "Profil des données", becomes a hub, not a dead end** | Unique profiler; gains the "Étapes suivantes" strip (§3). |
| `reconciliation` → `/dashboard/reconciliation` | **KEEP** | Unique signed-off diff workflow. |
| `report-studio` → `/dashboard/report-studio` | **KEEP** | The branded export hub. Route codegen through `src/platform/viz/export-client.ts`; demo-data banner; replace emoji icons with lucide. |
| `settings` → `/dashboard/settings` | **KEEP** | Mount `SettingsEffects` globally (Wave 1); add Langue + "Réduire les animations" prefs; absorbs diagnostics panel. |
| `ux-innovations` → `/dashboard/ux-innovations` | **MERGE: tour → shell first-run; achievements → Help "Progression" tab; DELETE route** | Real telemetry-driven gamification trapped on an orphan route. Its `OnboardingTour` becomes the app-wide first-run experience. |
| `/dashboard/charts` nav item | **DELETE (one line)** | Links to a route that does not exist; 404s from sidebar and palette. |
| `/` landing page | **KEEP (web only) — retokenize, de-SaaS** | Electron boots straight to `/dashboard` (§7). Remove pricing/SSO/"Talk to us"; landing becomes an offline-first product story and the showcase for full parallax. |
| `/login`, `/signup` (auth) | **KEEP — demote to optional local profile** | Dashboard is not gated today and shouldn't be for an offline desktop tool. Add "Continuer sans compte"; remove the dead "Forgot password?" button; auth reachable from topbar/settings, never a forced funnel. |
| Electron sherpa-onnx voice service (`electron/voice-service.ts` + IPC + models + script) | **DELETE** | Fully wired, zero consumers; the browser voice stack (VAD+Whisper+Kokoro) is the shipped, reachable path. Reclaims model weight and IPC surface. |
| `src/workers/ml.worker.ts` | **DELETE** | Never imported; deep-analytics ships its own worker. |
| `src/workers/llm.worker.ts` + `src/hooks/use-llm-inference.ts` | **DELETE** | Unused; live AI path is `src/platform/ai/provider`. |
| `layout.worker.ts` geo exports (supercluster/h3 hexbin) + `supercluster` dep | **DELETE** | Exported, never called; geo-analysis renders region aggregates. (Revivable from git if point clustering is ever specced.) |
| Atlas design system (`src/design/tokens.css|primitives|blocks`) | **MERGE-INTO tokens v2, then DELETE** | Second token vocabulary on a theme mechanism the app never sets. Port motion kill-switch + density vars into globals.css; migrate its 4 consumer files to shadcn primitives. |
| `tailwind.config.ts` (dead v3) | **DELETE** | Never loaded; contradicts the oklch variables. |
| `src/components/ui/sidebar.tsx`, `chart.tsx` (recharts), `StatsCard`, `PageHeader` | **sidebar.tsx DELETE; chart.tsx + recharts DELETE (after import check); StatsCard/PageHeader REBUILD as v2 primitives** | Zero/one consumers each; v2 ships `PageHeader` and `KpiStat` that every screen must use. |
| Dependency pairs | **Keep driver.js / DELETE react-joyride; keep canvas-confetti / DELETE react-confetti-boom; keep cva / DELETE tailwind-variants; keep radix-ui / DELETE @base-ui/react (after import audit); keep echarts+uplot+vega(data-formulator)+maplibre / DELETE recharts** | Each pair is a fork in visual behavior and bundle weight on medium-end PCs. |
| Duplicate `cn()` | **Keep `src/lib/utils.ts` canonical; `src/shared/utils.ts` becomes a re-export** | Heals the split import graph with zero churn. |

---

## 2. NEW INFORMATION ARCHITECTURE

**Pattern:** grouped collapsible sidebar (flat-with-groups, not hub-and-spoke) + Mission Control home as the discovery hub + command palette as the speed layer. **11 top-level items + 2 footer items**, French-primary labels.

```
┌─ [Logo] Data Navigator          ── dataset switcher (active dataset + freshness)
│
│  ACCUEIL
│   ◆ Accueil ............................ /dashboard
│
│  RAPPORT
│   ◆ Rapport Télécom .................... /dashboard/telecom-report   (8 tabs in-page)
│   ◆ Surveillance Canaux  [LIVE] ........ /dashboard/monitor
│
│  INTELLIGENCE
│   ◆ Studio IA .......................... /dashboard/data-formulator
│   ◆ Briefing IA ........................ /dashboard/ai-briefing
│   ▸ Analyse (group, header → hub) ...... /dashboard/analysis          (NEW hub page)
│       · Analyse statistique ............ /dashboard/ai-analysis
│       · Analyses approfondies .......... /dashboard/deep-analytics
│       · Prévisions ..................... /dashboard/forecast
│       · Géographie ..................... /dashboard/geo-analysis
│
│  DONNÉES
│   ◆ Importer ........................... /dashboard/upload
│   ▸ Données (group, header → hub) ...... /dashboard/data              (NEW hub page)
│       · Catalogue ...................... /dashboard/folders
│       · Profil des données ............. /dashboard/parsed
│       · Explorateur .................... /dashboard/data-browser     (EXPOSED)
│       · Transformations ................ /dashboard/transform
│       · Lignage ........................ /dashboard/lineage
│       · Réconciliation ................. /dashboard/reconciliation
│       · Journal d'activité ............. /dashboard/history
│
│  SORTIES
│   ◆ Studio de Rapports ................. /dashboard/report-studio
│   ◆ Théâtre Analytique ................. /dashboard/analytics-theater
│   ◆ Collaboration ...................... /dashboard/collaboration    (merged, live badge = real peer count)
│
├─ footer:  Aide /dashboard/help   ·   Paramètres /dashboard/settings
└─ [collapse to icon rail]
```

**Rules:**
- **Telecom tabs leave the sidebar.** `/dashboard/telecom-report/*` renders a sticky in-page tab rail (segmented control under the report header): Vue d'ensemble · Canaux · Analyse · Données brutes · Période · Journalier · Historique · Configuration. The sidebar shows one item. This halves sidebar height and ends the "two trees side by side" confusion.
- **Hub pages** (`/dashboard/analysis`, `/dashboard/data` — two new lightweight routes): launcher cards (icon, one-line French description, last-used timestamp) + recents for that domain. Group headers in the sidebar navigate to the hub; chevron expands inline children. Hubs give the 7-item Données group a discovery surface without widening the nav.
- **Badges:** only real values — LIVE on Surveillance (when engine running), peer count on Collaboration (from Awareness). The hardcoded `"3"` dies.
- **Narrow-window strategy (this is a desktop defect, not mobile):** Electron `minWidth: 1100, minHeight: 720`. Sidebar auto-collapses to a 56px icon rail below 1280px (icons + Radix Tooltip — replacing the hand-rolled hover divs, keyboard-focusable). Below `md` (web build / extreme resize): topbar hamburger opens a Sheet drawer reusing the same nav tree — the pattern the landing page already ships.
- **A11y baked into the new chrome:** `<nav aria-label="Navigation principale">` landmark, skip-to-content link as first focusable element, `focus-visible:ring-2 ring-ring` on every NavButton, `aria-current="page"`, tooltips via Radix (focus-triggered), 12px text floor in nav (no more 9px section labels — section labels become 12px/0.08em tracked).
- **Command palette (Ctrl+K) = speed + discovery layer.** Opens with **zero animation**. Indexes: all nav items + hub children, datasets (context-aware routing: telecom dataset → `/dashboard/telecom-report`, other → `/dashboard/parsed`), folders, **and actions**: "Importer un fichier", "Ouvrir le rapport du jour", "Générer un briefing", "Exporter (Studio de Rapports)", "Démarrer la visite guidée", "Basculer le thème", "Ouvrir l'assistant IA". Recents-first, fuzzy, inline shortcut hints. Remove the dead Charts entry.
- **AI surfaces collapse to three named concepts**: *Assistant* (the side panel, ambient, everywhere), *Studio IA* (data-formulator, the workbench), *Briefing IA* (narrative). Assistant results get a "Envoyer au Studio de Rapports" action so it stops being an island.

---

## 3. USER JOURNEY DESIGN — THE GOLDEN PATH

**Importer → Profiler → Explorer → Analyser → Rapporter → Exporter**, made legible by one new shared component: **`<NextSteps />`** — a slim strip at the bottom of every golden-path screen showing 2–3 contextual next actions (icon + label + one-liner), driven by dataset kind and journey state. This is the "complex flow" the owner wants: a connected journey, not isolated islands.

### The path, screen by screen

1. **Accueil (Mission Control).** First-run: cinematic empty state (see onboarding). With data: KPI hero row reads today's report health; primary CTA "Ouvrir le rapport du jour"; "Reprendre" cards (last report tab, last analysis, last export). Dataset freshness timestamp always visible ("Données du 11/06/2026, importées il y a 2 h").
2. **Importer (`/upload`).** Drag-and-drop **enabled** (the current rejection is removed) + native picker + paste (from csv-parser merge). The `?context=telecom` query fork dies. On success the pipeline's existing `telecomProfile.compatible` detection drives routing: **telecom file → "Rapport télécom détecté" success panel → primary CTA "Ouvrir le Rapport Télécom"** (auto-redirect after 3s, cancellable); generic file → "Profil des données" CTA. Success panel always shows: row count, date range detected, encoding, 3-row preview, and NextSteps (Profiler · Explorer · Analyser).
3. **Profil des données (`/parsed`).** No longer a dead end: header gains "Ouvrir dans l'Explorateur" and the NextSteps strip — *Analyser (IA) · Analyses approfondies · Transformer · Créer un rapport*. Quality issues link to Transform with a pre-filled recipe suggestion.
4. **Explorer (`/data-browser` or telecom grid).** Saved filters/SQL surface to the palette; "Envoyer la sélection au Studio de Rapports" action on starred rows.
5. **Analyser** (any Analyse screen). Every analysis screen gains a sticky footer action: **"Ajouter au rapport"** — pushes the current insight/chart spec onto a shared `report-draft` store (new, small Zustand slice) that Report Studio reads. This is the missing analyze→report edge, built once, used by ai-analysis, deep-analytics, forecast, geo, briefing.
6. **Studio de Rapports.** Opens with the draft items pre-staged; demo data only behind an explicit banner ("Données de démonstration — Importer un fichier" + CTA). Export completion toast links to the file location and "Présenter dans le Théâtre".
7. **Exporter / Présenter.** Theater and Studio both route through the shared export worker; export completion writes to the activity feed on Accueil — closing the loop.

### Empty states — one kit, no dead ends
New `<EmptyState kind>` primitive (icon, French title, one-line guidance, primary CTA, secondary link). **Every** data-dependent screen uses it with an "Importer un fichier" primary CTA: parsed-data, deep-analytics, forecast, ai-briefing, analytics-theater, lineage, geo, data-browser, transform, reconciliation. Monitor and Report Studio keep demo fallbacks but with the demo banner pattern. The false "Session expirée" dies via **boot-time catalog sync**: `DashboardBoot` calls `listRegisteredDatasets()` + `replaceDatasetsFromCatalog()` once; all per-feature private sync effects are removed.

### First-run onboarding (currently: none ever fires)
- `DashboardBoot` checks the existing `onboarding-db` completed flag. If unseen: **Bienvenue overlay** — 3 cinematic panels (stagger-entry, app tokens, French): *"Votre rapport DailyTransactions, analysé entièrement hors ligne"* → *"Importez, explorez, exportez"* → CTA **"Importer votre premier fichier"** + "Visite guidée (2 min)" + "Explorer librement".
- "Visite guidée" runs the existing driver.js `GLOBAL_TOUR`, rewritten: 6 stops (Accueil KPIs → Importer → Rapport Télécom → Analyse hub → Studio de Rapports → Ctrl+K). The broken `/dashboard/browser` anchor is removed.
- The tour is also re-launchable from Help and from the palette ("Démarrer la visite guidée").
- Achievements (Help → Progression) hook into the same telemetry: "Premier import", "Premier rapport exporté", "Première analyse IA" — gamifying the golden path itself.

---

## 4. VISUAL DESIGN SYSTEM v2

**Identity decision: converge on the existing electric-cyan/navy** (it's already the declared token intent, the landing, and auth). The sidebar's teal, topbar blue, selection indigo, and briefing violet all migrate to tokens. One accent: **Signal Cyan**. Violet survives only as `--chart-5` and an `--ai` semantic tint for AI surfaces (controlled, tokenized).

**Fonts (all bundled at build via `next/font/google` — self-hosted in the build output, zero runtime network):**
- **Geist** — UI sans (`--font-sans`), already loaded.
- **Fira Code** — mono/data (`--font-mono`), tabular numerals for every metric, already loaded.
- **Fraunces** — display serif (`--font-display`), **restricted to landing hero, theater scene titles, and first-run welcome** (the "cinéma" voice). Already loaded.
- **DELETE Archivo** from `layout.tsx` — fourth family, no assigned role, pure weight.

### globals.css v2 — replace lines 17–150 with this (Tailwind v4 syntax, verified in repo)

```css
:root {
  /* Light (secondary) theme — same family, kept functional */
  --background: oklch(0.984 0.003 248);
  --foreground: oklch(0.208 0.042 266);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.208 0.042 266);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.208 0.042 266);
  --primary: oklch(0.52 0.105 223);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.968 0.007 248);
  --secondary-foreground: oklch(0.208 0.042 266);
  --muted: oklch(0.968 0.007 248);
  --muted-foreground: oklch(0.5 0.046 257);
  --accent: oklch(0.951 0.012 222);
  --accent-foreground: oklch(0.302 0.056 230);
  --destructive: oklch(0.577 0.245 27);
  --destructive-foreground: oklch(0.985 0 0);
  --success: oklch(0.596 0.145 163);
  --success-foreground: oklch(0.985 0 0);
  --warning: oklch(0.666 0.179 58);
  --warning-foreground: oklch(0.985 0 0);
  --ai: oklch(0.585 0.18 290);                 /* AI-surface tint (was rogue violet) */
  --ai-foreground: oklch(0.985 0 0);
  --positive: oklch(0.596 0.145 163);          /* KPI delta up */
  --negative: oklch(0.577 0.245 27);           /* KPI delta down */
  --border: oklch(0.929 0.013 256);
  --input: oklch(0.929 0.013 256);
  --ring: oklch(0.609 0.126 222);
  --chart-1: oklch(0.609 0.126 222);
  --chart-2: oklch(0.546 0.245 263);
  --chart-3: oklch(0.596 0.145 163);
  --chart-4: oklch(0.769 0.188 70);
  --chart-5: oklch(0.585 0.233 277);
  --radius: 0.75rem;
  --sidebar: oklch(0.975 0.004 248);
  --sidebar-foreground: oklch(0.208 0.042 266);
  --sidebar-primary: oklch(0.52 0.105 223);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.951 0.012 222);
  --sidebar-accent-foreground: oklch(0.302 0.056 230);
  --sidebar-border: oklch(0.929 0.013 256);
  --sidebar-ring: oklch(0.609 0.126 222);
  --shadow-hsl: 250 25% 60%;
  --glow-primary: oklch(0.52 0.105 223 / 22%);
  --space: 0.25rem;                            /* 4-pt grid unit (density-scalable) */
  --motion-scale: 1;                           /* settings "réduire les animations" → 0 */
}

.dark {
  /* Dark-first — Signal Cyan on blue-tinted navy. Surface elevation ramp. */
  --surface-0: oklch(0.145 0.012 265);   /* app bg */
  --surface-1: oklch(0.185 0.014 263);   /* card */
  --surface-2: oklch(0.215 0.016 262);   /* raised / popover */
  --surface-3: oklch(0.245 0.018 261);   /* overlay panel */
  --background: var(--surface-0);
  --foreground: oklch(0.97 0.005 250);
  --card: var(--surface-1);
  --card-foreground: oklch(0.97 0.005 250);
  --popover: var(--surface-2);
  --popover-foreground: oklch(0.97 0.005 250);
  --primary: oklch(0.789 0.154 211);           /* Signal Cyan */
  --primary-foreground: oklch(0.16 0.025 235);
  --secondary: oklch(0.23 0.018 256);
  --secondary-foreground: oklch(0.97 0.005 250);
  --muted: oklch(0.22 0.015 260);
  --muted-foreground: oklch(0.72 0.035 256);   /* raised from 0.704 for contrast */
  --accent: oklch(0.24 0.02 250);
  --accent-foreground: oklch(0.97 0.005 250);
  --destructive: oklch(0.704 0.191 22);
  --destructive-foreground: oklch(0.985 0 0);
  --success: oklch(0.765 0.177 163);
  --success-foreground: oklch(0.15 0.03 170);
  --warning: oklch(0.837 0.128 66);
  --warning-foreground: oklch(0.18 0.04 60);
  --ai: oklch(0.673 0.182 290);
  --ai-foreground: oklch(0.16 0.03 290);
  --positive: oklch(0.765 0.177 163);
  --negative: oklch(0.704 0.191 22);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.715 0.13 215);
  --chart-1: oklch(0.789 0.154 211);
  --chart-2: oklch(0.623 0.214 260);
  --chart-3: oklch(0.765 0.177 163);
  --chart-4: oklch(0.837 0.128 66);
  --chart-5: oklch(0.673 0.182 277);
  --sidebar: oklch(0.165 0.013 264);
  --sidebar-foreground: oklch(0.97 0.005 250);
  --sidebar-primary: oklch(0.789 0.154 211);
  --sidebar-primary-foreground: oklch(0.16 0.025 235);
  --sidebar-accent: oklch(0.23 0.018 256);
  --sidebar-accent-foreground: oklch(0.97 0.005 250);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.715 0.13 215);
  --shadow-hsl: 255 35% 4%;                    /* hue-tinted shadow base (Comeau) */
  --glow-primary: oklch(0.789 0.154 211 / 18%);
}

@theme inline {
  /* …existing color/font/radius mappings stay, plus: */
  --color-ai: var(--ai);
  --color-ai-foreground: var(--ai-foreground);
  --color-positive: var(--positive);
  --color-negative: var(--negative);
  --color-surface-0: var(--surface-0);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --font-display: var(--font-edition-serif), var(--font-data-navigator-sans), serif;

  /* Shadow system — 3-layer, hue-tinted */
  --shadow-1: 0 1px 1px hsl(var(--shadow-hsl) / 0.25),
              0 2px 2px -1px hsl(var(--shadow-hsl) / 0.2);
  --shadow-2: 0 1px 1.1px hsl(var(--shadow-hsl) / 0.3),
              0 3px 3.3px -1.2px hsl(var(--shadow-hsl) / 0.28),
              0 8px 9px -2.5px hsl(var(--shadow-hsl) / 0.26);
  --shadow-3: 0 1px 1.2px hsl(var(--shadow-hsl) / 0.32),
              0 5px 5.5px -1px hsl(var(--shadow-hsl) / 0.3),
              0 14px 14px -2px hsl(var(--shadow-hsl) / 0.28),
              0 28px 28px -3px hsl(var(--shadow-hsl) / 0.24);

  /* Z-index scale (only these values may be used) */
  --z-sticky: 10;   --z-sidebar: 20;  --z-topbar: 30;  --z-dock: 40;
  --z-drawer: 50;   --z-modal: 60;    --z-palette: 70; --z-toast: 80; --z-tour: 90;

  /* Motion tokens */
  --dur-micro: 120ms;  --dur-enter: 180ms;  --dur-overlay: 240ms;
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
}

/* ===== The dn-* layer — DEFINED AT LAST (16 screens silently depend on these) ===== */
@utility dn-app-bg {
  background-color: var(--background);
  /* static SVG grain, 3% — large dark surfaces only */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
}
@utility dn-page { min-height: 100%; padding: calc(var(--space) * 6); }
@utility dn-page-shell { margin-inline: auto; width: 100%; max-width: 72rem;
  padding-inline: calc(var(--space) * 6); padding-block: calc(var(--space) * 6); }
@utility dn-page-shell-wide { margin-inline: auto; width: 100%; max-width: 96rem;
  padding-inline: calc(var(--space) * 6); padding-block: calc(var(--space) * 6); }
@utility dn-sticky-header { position: sticky; top: 0; z-index: var(--z-sticky);
  background: color-mix(in oklab, var(--background) 88%, transparent);
  backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
  padding-block: calc(var(--space) * 3); }
@utility dn-panel { background: var(--card); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-1); }

/* Spotlight border — JS writes --mx/--my via rAF-throttled pointermove, no React state */
@utility dn-spot {
  position: relative;
}
.dn-spot::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
  pointer-events: none; opacity: 0; transition: opacity 200ms var(--ease-out-quart);
  background: radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%),
              var(--glow-primary), transparent 40%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
}
.dn-spot:hover::before { opacity: 1; }

/* Hover shadow crossfade — never animate box-shadow directly */
@utility dn-elevate { position: relative; }
.dn-elevate::after { content: ""; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: var(--shadow-2); opacity: 0; transition: opacity 180ms var(--ease-out-quart);
  pointer-events: none; }
.dn-elevate:hover::after { opacity: 1; }

@property --mx { syntax: "<length-percentage>"; inherits: false; initial-value: 50%; }
@property --my { syntax: "<length-percentage>"; inherits: false; initial-value: 50%; }
```

**Scales (hard rules for all new code):**
- **Spacing:** 4-pt grid only (`--space` multiples); page gutter 24px; card padding 16/20px; section gap 32px. Density setting scales `--space` (0.875 compact / 1 normal).
- **Radius:** keep `--radius: 0.75rem` + existing derived scale (sm 0.45 → 4xl 1.95rem). Cards `radius-xl`, inputs/buttons `radius-md`, pills full.
- **Typography ramp:** display 30/36 semibold (page titles — one size, everywhere, via PageHeader v2), section 20/28 semibold, body 14/20, data-label 12/16 medium uppercase 0.08em, data-value Fira Code tabular. **12px floor — `text-[9px]/[10px]/[11px]` are banned**; the 857 occurrences are codemodded to `text-xs` + the `data-label` utility.
- **Glass budget:** `backdrop-filter` only on command palette, toasts, and `dn-sticky-header` (≤12px blur, never animated, never under a scrolling region beyond the header).
- **Theme mechanism: one.** `.dark` class only. `[data-theme]` (Atlas) dies; `ui/sonner.tsx` switches to the app's `useTheme()`; `<html lang="fr">`.
- **Settings accent/density:** `SettingsEffects` moves to the root dashboard layout (global), its unmount-cleanup removed; hardcoded hues now read tokens so the accent picker finally works app-wide.

---

## 5. MOTION SYSTEM

**Library decisions (all already installed):** `motion/react` v12 for JS-driven motion; **CSS scroll-driven animations (`animation-timeline: view()`)** for all parallax/scroll depth (compositor-only, Electron Chromium guarantees support, zero JS scroll listeners); `scrollama` stays for Theater scene orchestration only. DELETE react-joyride and react-confetti-boom.

### Named primitives (the only sanctioned motions — export from `src/design-system/motion.ts`)

| Primitive | Spec | Where used |
|---|---|---|
| `enter-rise` | opacity 0→1 + translateY 10px→0, 180ms `--ease-out-quart` | Panels, cards, modals content; route-level content mount |
| `stagger-grid` | `enter-rise` children, 40ms increments, **cap 6**, once per session per route (session-keyed) | KPI rows, launcher grids, hub cards |
| `count-up` | number-ticker, 600ms, once per page load | KPI values, telemetry |
| `spring-press` | scale 0.98 on press, spring release (stiffness 500, damping 30) | Buttons, launcher cards, nav items |
| `spotlight-hover` | CSS-only `dn-spot` (vars via rAF pointermove) | Interactive cards (home launcher, hub cards, template cards) |
| `crossfade-shadow` | `dn-elevate` pseudo-element opacity | Any hoverable card |
| `parallax-depth` | CSS `animation-timeline: view()`, translateY ±6% + opacity, **background/decorative layers only, never text or data** | Landing sections, Accueil hero band, Theater backdrops |
| `tilt-hero` | `useMotionValue` rotateX/rotateY ±4° | Landing hero mock only (already exists) |
| `scene-scrub` | scrollama-driven scene transitions, transform/opacity only | Analytics Theater only |
| `drawer-spring` | motion spring, interruptible | Sheet drawer, AI panel, resizable panels |
| `shimmer-flow` | existing CSS keyframe | Pipeline/flow visualizations, skeletons |
| `pulse-live` | existing `pulse-dot` keyframe | LIVE badges, presence dots |

### Hard performance budget (medium-end PC, enforced in review)
1. **Animate only `transform`, `opacity`, `clip-path`.** Layout/paint properties never animate. `will-change` only while animating.
2. **Never animate:** command palette open, tab switches, table sort, hover states in data grids, any keyboard-initiated action, anything repeated 100+×/day.
3. **No re-trigger on revisit** — entrances are session-keyed per route.
4. **Durations:** micro 120ms, entrances 180ms, overlays 240ms, exits 0.8×; nothing over 300ms outside Theater/landing.
5. **Parallax zones:** landing, Accueil hero band, Theater. **Zero parallax in any working screen.** Scroll depth = CSS `animation-timeline` only (no JS scroll handlers anywhere except scrollama in Theater).
6. **One scroll-driven surface per route maximum.**
7. **Blur:** ≤12px, max 3 fixed surfaces (palette/toast/sticky-header), never animated.
8. **Animated CSS vars** declared with `@property { inherits: false }` (`--mx/--my` done above).
9. **Reduced motion:** existing `prefers-reduced-motion` guard stays; settings "Réduire les animations" sets `--motion-scale: 0` + `data-animations="off"` (ported from Atlas); every motion primitive reads it via a shared `useMotionPrefs()` hook.
10. **Quiet main thread:** CSV/report computation stays in workers (already true) so S-tier animation never competes; verify NVIDIA "Background Max Frame Rate" note in QA on target hardware.

---

## 6. SCREEN-BY-SCREEN REDESIGN SPECS (by wave)

### WAVE 1 — Shell, nav, tokens (foundation; nothing user-visible breaks)
**Shell chrome (sidebar + topbar).**
- *Layout:* 232px sidebar (56px rail collapsed), grouped per §2, dataset switcher pinned top (active dataset name + freshness + kind icon), footer Aide/Paramètres + collapse toggle. Topbar h-14: hamburger (<md) · breadcrumbs · global search button (Ctrl+K) · Assistant IA button (token `--ai` tint, not hardcoded blue) · notifications · avatar.
- *Components:* NavButton v2 (Radix Tooltip when collapsed, focus-visible ring, `aria-current`), `<nav>` landmark, skip link, Sheet drawer for narrow.
- *Motion:* `spring-press` on nav items; sidebar collapse animates width via transform-scale illusion (rail + label opacity), 200ms; **no animation** on palette open.
- *Empty state:* n/a.
**Boundary layer.** `src/app/dashboard/error.tsx` (shell-preserving, token-styled, French: "Une erreur est survenue" + Réessayer + Retour à l'accueil→/dashboard), `src/app/dashboard/not-found.tsx`, `loading.tsx` per heavy route group (skeleton matching PageHeader+content grid); restyle root error/404 with tokens, CTAs → /dashboard.
**Electron:** minWidth/minHeight, French app menu (or `autoHideMenuBar: true` + custom), boot URL → `/dashboard`.

### WAVE 2 — Accueil + Importer + golden path connective tissue
**Accueil — Mission Control (`/dashboard`).**
- *Layout (F-pattern):* Hero band (full-width, `dn-app-bg` grain + one `parallax-depth` aurora layer behind content): greeting in French + dataset freshness + 4 KPI hero cards (valeur Fira-Code count-up, delta chip ±`--positive/--negative`, sparkline, "vs hier"). Below: 2-col — left 2/3 "Rapport du jour" hero panel (mini canal chart + status mix + "Ouvrir le rapport" CTA); right 1/3 "Reprendre" recents + activity feed (collapsible). Bottom: launcher grid of 6 group cards mirroring sidebar sections (`spotlight-hover` + `stagger-grid`).
- *Motion:* `stagger-grid` on KPI row (first visit/session), `count-up` on values, `parallax-depth` on hero backdrop only.
- *Empty state:* full-screen cinematic welcome — Fraunces display title "Votre rapport, entièrement hors ligne", 3 staggered step cards (Importer → Analyser → Exporter), primary CTA "Importer un fichier DailyTransactions". This doubles as the first-run surface.
**Importer (`/upload`).**
- *Layout:* two-zone — left: large dropzone (drag-drop enabled, paste, picker), encoding + advanced parsing accordion (csv-parser merge: delimiter/types/filters/rejects); right: import history timeline + "Datasets enregistrés".
- *Motion:* dropzone border glow on dragover (opacity), progress shimmer; success panel `enter-rise` with telecom-detected routing (§3).
- *Empty state:* the screen is its own empty state.
**Profil des données (`/parsed`).** Sticky header (dataset + quality ring), virtualized column list left, detail right; **NextSteps strip** bottom. Empty: EmptyState kit + import CTA.
**Hubs (`/dashboard/data`, `/dashboard/analysis`).** PageHeader + launcher cards (icon, description, last-used) + domain recents. `stagger-grid`, `spotlight-hover`. Empty: cards always render; data-dependent cards show "Nécessite un dataset" chip.
**First-run onboarding + palette v2 + EmptyState kit + NextSteps + boot catalog sync** (all §3).

### WAVE 3 — Telecom report suite (the flagship gets the most polish)
**All 8 tabs (`/telecom-report/*`).**
- *Layout:* shared report chrome — `dn-sticky-header` containing: report title "Rapport Télécom" + date + file chip + in-page tab rail (8 tabs, no animation on switch) + actions (Exporter, Partager LAN, Actualiser). Content area `dn-page-shell-wide`.
- *Vue d'ensemble:* KPI cards rebuilt on shared `KpiStat` primitive (token selection states — indigo dies), canal share/amount charts, hourly heatmap, forecast section linking to `/forecast`. H1 normalized to PageHeader (kills the `text-sm` h1).
- *Données brutes (grid):* virtualized grid is motion-free; row hover = background token only; customer profile opens as right Sheet (`drawer-spring`).
- *Configuration:* settings-style two-column panel layout; LAN panel adopts the merged collaboration visual language.
- *Motion:* `count-up` on KPIs once; `enter-rise` on tab content mount (once per tab per session); nothing else.
- *Empty state:* existing "Aucun rapport chargé" rebuilt on EmptyState kit ("Ouvrir l'Import" CTA preserved).
- French copy normalized throughout (it's already mostly French — it becomes the reference voice).

### WAVE 4 — Intelligence & secondary screens
- **Studio IA (data-formulator):** absorb agent-canvas Trace panel (xyflow DAG + AG-UI log as a collapsible right drawer); briefing agent calls ai-briefing engine; voice button unchanged; `--ai` tint on agent chrome. Empty: EmptyState + import CTA + "Essayer avec données de démo" if available.
- **Briefing IA:** narrative reading layout (max-w-3xl, generous line-height), Fraunces pull-quotes for headline insights, TTS playbar pinned bottom; violet→`--ai`. Sticky "Ajouter au rapport" per section.
- **Analyse statistique (ai-analysis):** forecast tab → link card to `/forecast`; "Session expirée" state deleted (boot sync); insights cards get "Ajouter au rapport".
- **Analyses approfondies (deep-analytics):** retokenize all slate hardcodes (light mode fixed); delete dead wizard; results tables on shared primitives.
- **Prévisions (forecast):** keep structure; numbers on `KpiStat`; scenario sliders use `drawer-spring` interruptible springs.
- **Géographie:** map fills viewport minus header; insight rail right; empty state explains the required region column with a column-mapping CTA.
- **Surveillance (monitor):** ops-dense layout stays; demo banner pattern; alert timeline uses `pulse-live` only on active alerts.
- **Studio de Rapports:** template gallery with `spotlight-hover` cards (lucide icons, token gradients); draft items from "Ajouter au rapport" pre-staged in a left rail; export progress through shared worker; demo banner.
- **Théâtre Analytique:** the cinema — full `scene-scrub` scrollytelling retained, scene backdrops gain `parallax-depth` layers, Fraunces scene titles, presenter mode polish. Empty: EmptyState + import CTA.
- **Collaboration (merged):** presence bar top; tabs Commentaires · Annotations · Approbations · Journal; real peer-count badge.
- **Transform / Lineage / Réconciliation / Catalogue / Explorateur / Journal:** retokenize, PageHeader v2, EmptyState kit, NextSteps where relevant (Explorateur → "Envoyer au rapport"; Lineage empty → links to Transform).
- **Aide:** rewritten content matching new IA; Progression tab (achievements + confetti via canvas-confetti); tour launcher.
- **Paramètres:** + Langue (fr/en), + Réduire les animations, + Diagnostics système panel (merged shell screen).

### WAVE 5 — Landing, auth, polish
- **Landing (`/`):** retokenize onto v2 (kill `#07090f` hardcodes — tokens render identically); replace pricing/SSO sections with "Hors ligne par conception" (DuckDB, LLM local, LAN collab) story sections; full parallax showcase: CSS `view()`-driven layered depth per section, tilt-hero kept, `stagger-grid` reveals; CTA → "Télécharger / Ouvrir l'application" not signup.
- **Auth:** AuthShell retokenized; "Continuer sans compte" primary on Electron; dead "Forgot password?" removed; copy French.
- **Polish:** typography codemod残 (12px floor) sweep, density/accent QA across themes, reduced-motion QA, perf pass on target hardware (Intel iGPU): verify 60fps on Accueil hero + Theater with CSV parse running.

---

## 7. IMPLEMENTATION ORDER & RISK NOTES

### Wave 1 — Foundation (files)
1. `src/app/globals.css` — token v2 + `@utility dn-*` (§4). **Instant visual fix for 16 screens.**
2. `src/app/layout.tsx` — `lang="fr"`, drop Archivo, remove `@/design/tokens.css` import (after Atlas consumer migration).
3. `src/lib/utils.ts` canonical; `src/shared/utils.ts` → re-export.
4. `src/components/ui/sonner.tsx` — app `useTheme()`.
5. New `src/design-system/`: `motion.ts` (primitives), `page-header.tsx`, `kpi-stat.tsx`, `empty-state.tsx`, `next-steps.tsx`, `use-motion-prefs.ts`.
6. Shell rebuild: `src/features/dashboard-shell/nav/{app-sidebar,nav-button,nav-config}.tsx`, `topbar/topbar.tsx` (+ Sheet drawer, skip link, landmarks). nav-config = new IA (§2); delete Charts item.
7. `SettingsEffects` → mounted in `dashboard-layout.tsx`; remove unmount cleanup.
8. `DashboardBoot` — catalog sync (`listRegisteredDatasets` + `replaceDatasetsFromCatalog`).
9. Boundaries: `src/app/dashboard/{error,not-found}.tsx`, `loading.tsx` per heavy segment; restyle `src/app/{error,not-found}.tsx`.
10. `electron/main.ts` — `minWidth:1100, minHeight:720`, menu, boot URL `/dashboard`.
11. **Deletions:** `tailwind.config.ts`, `dashboard-shell/components/sidebar-nav.tsx`+stories, `src/workers/{ml,llm}.worker.ts`, `src/hooks/use-llm-inference.ts`, `deep-analytics/components/ReconciliationWizard.tsx`, `electron/voice-service.ts`+IPC+`scripts/download-sherpa-models.ps1`+`public/models/sherpa`, layout.worker geo exports + `supercluster`. Deps: react-joyride, react-confetti-boom, tailwind-variants, recharts+`ui/chart.tsx`, @base-ui/react — **each only after a zero-import grep**.

### Wave 2 — Golden path
`dashboard-home/` rebuild; `data-import/DataImportScreen.tsx` (drag-drop, success routing via `telecomProfile.compatible` in `getUploadSuccessPath`, advanced mode from csv-parser); `parsed-data` NextSteps; new `src/app/dashboard/{data,analysis}/page.tsx` hubs; `command-palette.tsx` actions + context-aware dataset routing; first-run in `dashboard-boot.tsx` + rewritten `help/data/tours.ts`; EmptyState rollout (deep-analytics, forecast, ai-briefing, theater, lineage, parsed, geo); new `report-draft` store slice.
**Redirects (next.config or redirect pages):** `/dashboard/csv-parser→/upload?mode=advanced`, `/dashboard/browser→/telecom-report/grid`, `/dashboard/agent-canvas→/data-formulator` (W4), `/dashboard/collab-hub|collaborative→/collaboration` (W4), `/dashboard/ux-innovations→/help?tab=progression`, `/dashboard/dashboard-shell→/settings?panel=diagnostics`.

### Wave 3 — Telecom suite
Report chrome component (tab rail) in `src/app/dashboard/telecom-report/layout.tsx`; per-tab retokenization; `telecom/components/kpi-card.tsx` → `KpiStat`; remove telecom sub-items from sidebar nav-config.

### Wave 4 — Intelligence/secondary (parallelizable per feature — ideal for subagents)
Each feature is an independent lane: ai-analysis, deep-analytics, forecast, geo, briefing, formulator+agent-canvas merge, monitor, report-studio (export-worker unification), theater, collaboration merge, transform/lineage/reconciliation/folders/data-browser/history, help+achievements, settings+diagnostics. Then delete `agent-canvas/`, `collab-hub/`, `csv-parser/` (after ports), `ux-innovations/` (after ports), `src/design/`.

### Wave 5 — Landing/auth/polish
`src/app/page.tsx` retokenize + parallax v2; `src/components/auth/*`; typography codemod (`text-\[(9|10|11)px\]` sweep); QA matrix (light/dark × density × reduced-motion × 1100px window).

### Regression risks
1. **Telecom runtime coupling** — `telecom-report-runtime` force-overwrites the global active dataset on mount; nav restructure must not change mount order. Test: open report → navigate away → active dataset behavior unchanged.
2. **Persisted Zustand/IndexedDB keys** — collaboration merge and route renames must not change store names/persist keys, or users lose annotations/history. Keep store keys, change only routes/UI.
3. **Boot catalog sync** could race feature-local sync effects — remove the private effects in the same PR per feature, not before.
4. **Redirect coverage** — Help content, tours, and palette index all reference old routes; rewrite `help-content.ts` and `tours.ts` in the same wave as each deletion.
5. **dn-* utilities going live** changes layout on 16 screens at once — screenshot-diff those routes (Storybook test-runner exists) before/after Wave 1.
6. **Dependency deletions** — recharts/@base-ui/tailwind-variants each need a zero-import grep first; `ui/chart.tsx` may have hidden consumers.
7. **SettingsEffects global mount** — verify the accent picker doesn't fight `.dark` token values on first paint (apply before paint via layout effect).
8. **Electron boot URL change** — confirm deep links/`loadURL` fallbacks and the production static export path serve `/dashboard` correctly.
9. **Sherpa deletion** — confirm git-lfs model removal doesn't break the build script chain; keep the browser voice stack untouched (it's the live path).
10. **French copy pass** — string changes break any test snapshots keyed on copy; update fixtures per wave.
