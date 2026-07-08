"use client";

/**
 * Pure context-menu builders for data-bearing desktop objects.
 *
 * These functions are framework-agnostic factories: they take a piece of data
 * (a dataset, a folder, a chart, a KPI) plus a small bag of side-effecting
 * actions, and return a French `MenuItem[]` ready to hand to `<IconContextMenu>`.
 *
 * No JSX, no React, no store access here — every effect is injected through the
 * `actions` argument so integration layers stay in full control of wiring
 * (which `openApp`, which `pinSnapshot`, etc.). This keeps the builders trivially
 * testable and lets any window mount them verbatim.
 *
 * Wiring conventions (see desktop suite contract):
 *  - `openApp(appId, opts)`            → open a feature window
 *  - `setActiveDataset(id)`            → make a dataset the global active one
 *  - `askMoudir(prompt)`              → openApp("moudir") + dispatch "moudir:ask"
 *  - `pinSnapshot(...)`               → pin a live snapshot card to the desktop
 *  - `addWidget(...)`                 → drop a live widget on the desktop
 *  - `setCrossFilter({dimension,value})` / `clearCrossFilter()` → linked views
 *  - `setSelection(sel)`              → publish the global context-bus selection
 */

import type { MenuItem } from "@/features/desktop/components/icon-context-menu";

// ─── Light structural shapes ──────────────────────────────────────────────────
// We deliberately accept structural subsets instead of the full store types so a
// caller can pass a `Dataset`, a `CatalogFolder`, or a lightweight view-model
// without importing/owning the heavy store types. Only the fields the menus
// actually read are required.

/** Minimal dataset shape the dataset menu reads. */
export interface DatasetMenuTarget {
  id: string;
  name: string;
  /** DuckDB view/table name, forwarded into drag payloads / queries. */
  tableName?: string;
}

/** Minimal folder shape the folder menu reads. */
export interface FolderMenuTarget {
  id: string;
  name: string;
}

/**
 * Chart context the chart menu reads. `datasetId`/`title` drive ask-prompts and
 * snapshot titles; `html`/`image` (when present) become the pinned snapshot
 * body; `dimension`/`value` (when present) enable the cross-filter action.
 */
export interface ChartMenuTarget {
  id?: string;
  title?: string;
  appId?: string;
  datasetId?: string;
  html?: string;
  image?: string;
  /** Active drill dimension, e.g. "channel". Enables "Filtrer le bureau". */
  dimension?: string;
  /** Active drill value, e.g. "SMS". Paired with `dimension`. */
  value?: string;
}

/**
 * KPI context the KPI menu reads. `key` is the metric identifier used for the
 * pinned widget config; `label`/`value` are display strings for prompts.
 */
export interface KpiMenuTarget {
  /** Stable metric key, e.g. "successRate" | "totalTx" | "topError". */
  key: string;
  label: string;
  value?: string | number;
  /** Optional dimension/value pair for cross-filtering off a KPI tile. */
  dimension?: string;
  filterValue?: string;
}

// ─── Injected action bag ──────────────────────────────────────────────────────

/** Shape of a desktop selection published on the context bus. */
export interface MenuSelection {
  kind: "dataset" | "folder" | "chart" | "kpi" | "column" | "window" | null;
  id?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/** A cross-filter request (matches the context-bus `CrossFilter` object form). */
export interface MenuCrossFilter {
  dimension: string;
  value: string;
}

/**
 * Side effects the builders may invoke. All are optional so a caller can wire
 * only what a given surface supports; menu entries that depend on a missing
 * action are simply omitted, so the resulting menu never offers a dead action.
 */
export interface DataMenuActions {
  /** Open a feature window. `appId` is a registry key (telecom, forecast, …). */
  openApp?: (appId: string, opts?: { props?: Record<string, unknown>; forceNew?: boolean }) => void;
  /** Make a dataset the global active dataset. */
  setActiveDataset?: (id: string | null) => void;
  /** Ask Moudir: opens the assistant and dispatches the prompt. */
  askMoudir?: (prompt: string) => void;
  /** Pin a live snapshot card onto the desktop. */
  pinSnapshot?: (snapshot: {
    title: string;
    kind: "chart" | "table" | "answer" | "image";
    appId: string;
    html?: string;
    text?: string;
    image?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  }) => void;
  /** Drop a live widget onto the desktop. */
  addWidget?: (widget: {
    type: "kpi" | "sparkline" | "clock" | "channels";
    config: Record<string, unknown>;
    x?: number;
    y?: number;
  }) => void;
  /** Publish a global cross-filter (linked views). */
  setCrossFilter?: (filter: MenuCrossFilter) => void;
  /** Clear the active cross-filter. */
  clearCrossFilter?: () => void;
  /** Publish the global context-bus selection. */
  setSelection?: (selection: MenuSelection) => void;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Drop falsy entries and collapse leading/trailing/duplicate separators. */
function clean(items: Array<MenuItem | null | undefined | false>): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      // Never start with a separator, and never emit two in a row.
      if (out.length === 0 || out[out.length - 1]?.separator) continue;
    }
    out.push(item);
  }
  // Never end with a trailing separator.
  while (out.length > 0 && out[out.length - 1]?.separator) out.pop();
  return out;
}

const SEPARATOR: MenuItem = { separator: true };

// ─── Builders ──────────────────────────────────────────────────────────────────

/**
 * Context menu for a dataset (sidebar item, desktop icon, table header, etc.).
 */
export function buildDatasetMenu(ds: DatasetMenuTarget, actions: DataMenuActions): MenuItem[] {
  const { openApp, setActiveDataset, askMoudir, setSelection } = actions;

  return clean([
    openApp && {
      label: "Ouvrir dans l'explorateur",
      onClick: () => openApp("data-browser", { props: { datasetId: ds.id } }),
    },
    openApp && {
      label: "Ouvrir dans Télécom",
      onClick: () => openApp("telecom", { props: { datasetId: ds.id } }),
    },
    SEPARATOR,
    setActiveDataset && {
      label: "Définir comme jeu de données actif",
      onClick: () => setActiveDataset(ds.id),
    },
    setSelection && {
      label: "Sélectionner pour l'inspecteur",
      onClick: () => setSelection({ kind: "dataset", id: ds.id, label: ds.name }),
    },
    SEPARATOR,
    askMoudir && {
      label: "Analyser avec Moudir",
      onClick: () => askMoudir(`Analyse le jeu de données « ${ds.name} » et résume-le.`),
    },
    openApp && {
      label: "Prévoir les tendances",
      onClick: () => openApp("forecast", { props: { datasetId: ds.id } }),
    },
    openApp && {
      label: "Générer un rapport",
      onClick: () => openApp("report-studio", { props: { datasetId: ds.id } }),
    },
  ]);
}

/**
 * Context menu for a folder (folder icon, sidebar folder, This-PC entry).
 */
export function buildFolderMenu(folder: FolderMenuTarget, actions: DataMenuActions): MenuItem[] {
  const { openApp, askMoudir, setSelection } = actions;

  return clean([
    openApp && {
      label: "Ouvrir le dossier",
      onClick: () => openApp("folders", { props: { initialFolderId: folder.id } }),
    },
    openApp && {
      label: "Ouvrir dans une nouvelle fenêtre",
      onClick: () =>
        openApp("folders", {
          props: { initialFolderId: folder.id },
          forceNew: true,
        }),
    },
    SEPARATOR,
    setSelection && {
      label: "Sélectionner pour l'inspecteur",
      onClick: () => setSelection({ kind: "folder", id: folder.id, label: folder.name }),
    },
    askMoudir && {
      label: "Résumer ce dossier",
      onClick: () =>
        askMoudir(`Résume le contenu du dossier « ${folder.name} » et ses jeux de données.`),
    },
  ]);
}

/**
 * Context menu for a chart inside a feature window (right-click on a chart).
 */
export function buildChartMenu(ctx: ChartMenuTarget, actions: DataMenuActions): MenuItem[] {
  const { pinSnapshot, askMoudir, setCrossFilter, clearCrossFilter, setSelection, openApp } =
    actions;

  const title = ctx.title?.trim() || "Graphique";
  const appId = ctx.appId ?? "data-browser";
  const hasFilter = Boolean(ctx.dimension && ctx.value);

  return clean([
    pinSnapshot &&
      Boolean(ctx.html || ctx.image) && {
        label: "Épingler sur le bureau",
        onClick: () =>
          pinSnapshot({
            title,
            kind: ctx.image ? "image" : "chart",
            appId,
            html: ctx.html,
            image: ctx.image,
          }),
      },
    setSelection && {
      label: "Sélectionner pour l'inspecteur",
      onClick: () =>
        setSelection({
          kind: "chart",
          id: ctx.id,
          label: title,
          meta: { datasetId: ctx.datasetId },
        }),
    },
    SEPARATOR,
    hasFilter &&
      setCrossFilter && {
        label: `Filtrer le bureau sur « ${ctx.value} »`,
        onClick: () =>
          setCrossFilter({
            dimension: ctx.dimension as string,
            value: ctx.value as string,
          }),
      },
    clearCrossFilter && {
      label: "Réinitialiser le filtre du bureau",
      onClick: () => clearCrossFilter(),
    },
    SEPARATOR,
    askMoudir && {
      label: "Expliquer ce graphique",
      onClick: () =>
        askMoudir(
          hasFilter
            ? `Explique le graphique « ${title} » pour ${ctx.dimension} = ${ctx.value}.`
            : `Explique le graphique « ${title} » et ses enseignements.`,
        ),
    },
    openApp &&
      Boolean(ctx.datasetId) && {
        label: "Ouvrir le jeu de données source",
        onClick: () => openApp("data-browser", { props: { datasetId: ctx.datasetId } }),
      },
  ]);
}

/**
 * Context menu for a KPI tile (right-click on a metric card).
 */
export function buildKpiMenu(kpi: KpiMenuTarget, actions: DataMenuActions): MenuItem[] {
  const { addWidget, pinSnapshot, askMoudir, setCrossFilter, setSelection, openApp } = actions;

  const valueText = kpi.value === undefined || kpi.value === null ? "" : ` : ${kpi.value}`;
  const hasFilter = Boolean(kpi.dimension && kpi.filterValue);

  return clean([
    addWidget && {
      label: "Ajouter comme widget de bureau",
      onClick: () =>
        addWidget({
          type: "kpi",
          config: { metric: kpi.key, label: kpi.label },
        }),
    },
    pinSnapshot && {
      label: "Épingler la valeur sur le bureau",
      onClick: () =>
        pinSnapshot({
          title: kpi.label,
          kind: "answer",
          appId: "telecom",
          text: `${kpi.label}${valueText}`,
        }),
    },
    setSelection && {
      label: "Sélectionner pour l'inspecteur",
      onClick: () =>
        setSelection({
          kind: "kpi",
          id: kpi.key,
          label: kpi.label,
          meta: { value: kpi.value },
        }),
    },
    SEPARATOR,
    hasFilter &&
      setCrossFilter && {
        label: `Filtrer le bureau sur « ${kpi.filterValue} »`,
        onClick: () =>
          setCrossFilter({
            dimension: kpi.dimension as string,
            value: kpi.filterValue as string,
          }),
      },
    askMoudir && {
      label: "Interroger Moudir sur cet indicateur",
      onClick: () =>
        askMoudir(
          `Que signifie l'indicateur « ${kpi.label} »${valueText} et comment l'améliorer ?`,
        ),
    },
    openApp && {
      label: "Voir le détail dans Télécom",
      onClick: () => openApp("telecom", { props: { focusMetric: kpi.key } }),
    },
  ]);
}
