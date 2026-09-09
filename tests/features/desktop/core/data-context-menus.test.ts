import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral test suite for data-context-menus builders.
 *
 * The module under test is a pure factory — no external I/O, no React, no
 * store access. The only import is a `MenuItem` type from the component
 * module, which we do NOT need to mock (it's a pure type import, not a
 * runtime value). Every test exercises REAL module logic.
 */

import type {
  ChartMenuTarget,
  DataMenuActions,
  DatasetMenuTarget,
  FolderMenuTarget,
  KpiMenuTarget,
} from "@/features/desktop/core/data-context-menus";
import {
  buildChartMenu,
  buildDatasetMenu,
  buildFolderMenu,
  buildKpiMenu,
} from "@/features/desktop/core/data-context-menus";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return true when every item in the array is a non-separator with a label. */
function allLabeled(items: ReturnType<typeof buildDatasetMenu>): boolean {
  return items.every((item) => !item.separator && typeof item.label === "string");
}

/** Get item by label from the menu. */
function byLabel(
  items: ReturnType<typeof buildDatasetMenu>,
  label: string,
): (typeof items)[0] | undefined {
  return items.find((item) => item.label === label);
}

/** Count separators in a menu result. */
function countSeparators(items: ReturnType<typeof buildDatasetMenu>): number {
  return items.filter((item) => item.separator).length;
}

// ─── buildDatasetMenu ─────────────────────────────────────────────────────────

describe("buildDatasetMenu — structure", () => {
  const ds: DatasetMenuTarget = { id: "ds1", name: "Ventes 2026", tableName: "ventes" };

  it("returns an array", () => {
    // Arrange / Act
    const menu = buildDatasetMenu(ds, {});
    // Assert
    expect(Array.isArray(menu)).toBe(true);
  });

  it("returns an empty array when no actions are provided", () => {
    // All actions optional → clean() drops everything with no falsy items producing separators only.
    const menu = buildDatasetMenu(ds, {});
    expect(menu).toHaveLength(0);
  });

  it("never starts with a separator", () => {
    const menu = buildDatasetMenu(ds, { openApp: vi.fn() });
    expect(menu[0]?.separator).toBeFalsy();
  });

  it("never ends with a trailing separator", () => {
    const menu = buildDatasetMenu(ds, { openApp: vi.fn(), askMoudir: vi.fn() });
    const last = menu[menu.length - 1];
    expect(last?.separator).toBeFalsy();
  });

  it("never emits two consecutive separators", () => {
    const menu = buildDatasetMenu(ds, { openApp: vi.fn(), askMoudir: vi.fn() });
    for (let i = 1; i < menu.length; i++) {
      if (menu[i]?.separator) {
        expect(menu[i - 1]?.separator).toBeFalsy();
      }
    }
  });
});

describe("buildDatasetMenu — all actions wired", () => {
  const ds: DatasetMenuTarget = { id: "ds1", name: "Ventes 2026" };
  let openApp: ReturnType<typeof vi.fn>;
  let setActiveDataset: ReturnType<typeof vi.fn>;
  let askMoudir: ReturnType<typeof vi.fn>;
  let setSelection: ReturnType<typeof vi.fn>;
  let actions: DataMenuActions;

  beforeEach(() => {
    openApp = vi.fn();
    setActiveDataset = vi.fn();
    askMoudir = vi.fn();
    setSelection = vi.fn();
    actions = { openApp, setActiveDataset, askMoudir, setSelection };
  });

  it("includes 'Ouvrir dans Télécom' when openApp is provided", () => {
    const menu = buildDatasetMenu(ds, actions);
    expect(byLabel(menu, "Ouvrir dans Télécom")).toBeDefined();
  });

  it("clicking 'Ouvrir dans Télécom' calls openApp with telecom and datasetId", () => {
    const menu = buildDatasetMenu(ds, actions);
    byLabel(menu, "Ouvrir dans Télécom")?.onClick?.();
    expect(openApp).toHaveBeenCalledWith("telecom", { props: { datasetId: "ds1" } });
  });

  it("includes 'Définir comme jeu de données actif' when setActiveDataset is provided", () => {
    const menu = buildDatasetMenu(ds, actions);
    expect(byLabel(menu, "Définir comme jeu de données actif")).toBeDefined();
  });

  it("clicking 'Définir comme jeu de données actif' calls setActiveDataset with the dataset id", () => {
    const menu = buildDatasetMenu(ds, actions);
    byLabel(menu, "Définir comme jeu de données actif")?.onClick?.();
    expect(setActiveDataset).toHaveBeenCalledWith("ds1");
  });

  it("includes 'Sélectionner pour l'inspecteur' when setSelection is provided", () => {
    const menu = buildDatasetMenu(ds, actions);
    expect(byLabel(menu, "Sélectionner pour l'inspecteur")).toBeDefined();
  });

  it("clicking 'Sélectionner pour l'inspecteur' calls setSelection with dataset kind/id/label", () => {
    const menu = buildDatasetMenu(ds, actions);
    byLabel(menu, "Sélectionner pour l'inspecteur")?.onClick?.();
    expect(setSelection).toHaveBeenCalledWith({
      kind: "dataset",
      id: "ds1",
      label: "Ventes 2026",
    });
  });

  it("includes 'Analyser avec Moudir' when askMoudir is provided", () => {
    const menu = buildDatasetMenu(ds, actions);
    expect(byLabel(menu, "Analyser avec Moudir")).toBeDefined();
  });

  it("clicking 'Analyser avec Moudir' calls askMoudir with the dataset name interpolated", () => {
    const menu = buildDatasetMenu(ds, actions);
    byLabel(menu, "Analyser avec Moudir")?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(
      `Analyse le jeu de données « Ventes 2026 » et résume-le.`,
    );
  });

  it("contains a separator between the open-actions and the active/selection actions", () => {
    const menu = buildDatasetMenu(ds, actions);
    expect(countSeparators(menu)).toBeGreaterThanOrEqual(1);
  });
});

describe("buildDatasetMenu — partial actions", () => {
  const ds: DatasetMenuTarget = { id: "ds2", name: "Clients" };

  it("omits openApp entries when openApp is not provided", () => {
    const menu = buildDatasetMenu(ds, { setActiveDataset: vi.fn() });
    expect(byLabel(menu, "Ouvrir dans l'explorateur")).toBeUndefined();
    expect(byLabel(menu, "Ouvrir dans Télécom")).toBeUndefined();
  });

  it("omits setActiveDataset entry when setActiveDataset is not provided", () => {
    const menu = buildDatasetMenu(ds, { openApp: vi.fn() });
    expect(byLabel(menu, "Définir comme jeu de données actif")).toBeUndefined();
  });

  it("omits askMoudir entries when askMoudir is not provided", () => {
    const menu = buildDatasetMenu(ds, { openApp: vi.fn() });
    expect(byLabel(menu, "Analyser avec Moudir")).toBeUndefined();
  });

  it("omits setSelection entry when setSelection is not provided", () => {
    const menu = buildDatasetMenu(ds, { openApp: vi.fn() });
    expect(byLabel(menu, "Sélectionner pour l'inspecteur")).toBeUndefined();
  });

  it("returns only the items for the provided actions (setActiveDataset only)", () => {
    const menu = buildDatasetMenu(ds, { setActiveDataset: vi.fn() });
    // Only "Définir comme jeu de données actif" should appear.
    expect(menu).toHaveLength(1);
    expect(menu[0].label).toBe("Définir comme jeu de données actif");
  });
});

// ─── buildFolderMenu ──────────────────────────────────────────────────────────

describe("buildFolderMenu — structure", () => {
  const folder: FolderMenuTarget = { id: "f1", name: "Archives" };

  it("returns an empty array when no actions are provided", () => {
    expect(buildFolderMenu(folder, {})).toHaveLength(0);
  });

  it("never starts with a separator", () => {
    const menu = buildFolderMenu(folder, { openApp: vi.fn() });
    expect(menu[0]?.separator).toBeFalsy();
  });

  it("never ends with a trailing separator", () => {
    const menu = buildFolderMenu(folder, { openApp: vi.fn(), setSelection: vi.fn() });
    expect(menu[menu.length - 1]?.separator).toBeFalsy();
  });

  it("never emits two consecutive separators", () => {
    const menu = buildFolderMenu(folder, { openApp: vi.fn(), askMoudir: vi.fn() });
    for (let i = 1; i < menu.length; i++) {
      if (menu[i]?.separator) {
        expect(menu[i - 1]?.separator).toBeFalsy();
      }
    }
  });
});

describe("buildFolderMenu — all actions wired", () => {
  const folder: FolderMenuTarget = { id: "f1", name: "Archives Q1" };
  let openApp: ReturnType<typeof vi.fn>;
  let askMoudir: ReturnType<typeof vi.fn>;
  let setSelection: ReturnType<typeof vi.fn>;
  let actions: DataMenuActions;

  beforeEach(() => {
    openApp = vi.fn();
    askMoudir = vi.fn();
    setSelection = vi.fn();
    actions = { openApp, askMoudir, setSelection };
  });

  it("includes 'Ouvrir le dossier' when openApp is provided", () => {
    expect(byLabel(buildFolderMenu(folder, actions), "Ouvrir le dossier")).toBeDefined();
  });

  it("clicking 'Ouvrir le dossier' calls openApp with folders and initialFolderId", () => {
    buildFolderMenu(folder, actions)
      .find((i) => i.label === "Ouvrir le dossier")
      ?.onClick?.();
    expect(openApp).toHaveBeenCalledWith("folders", { props: { initialFolderId: "f1" } });
  });

  it("includes 'Ouvrir dans une nouvelle fenêtre' when openApp is provided", () => {
    expect(
      byLabel(buildFolderMenu(folder, actions), "Ouvrir dans une nouvelle fenêtre"),
    ).toBeDefined();
  });

  it("clicking 'Ouvrir dans une nouvelle fenêtre' calls openApp with forceNew: true", () => {
    buildFolderMenu(folder, actions)
      .find((i) => i.label === "Ouvrir dans une nouvelle fenêtre")
      ?.onClick?.();
    expect(openApp).toHaveBeenCalledWith("folders", {
      props: { initialFolderId: "f1" },
      forceNew: true,
    });
  });

  it("includes 'Sélectionner pour l'inspecteur' when setSelection is provided", () => {
    expect(
      byLabel(buildFolderMenu(folder, actions), "Sélectionner pour l'inspecteur"),
    ).toBeDefined();
  });

  it("clicking 'Sélectionner pour l'inspecteur' calls setSelection with folder kind/id/label", () => {
    buildFolderMenu(folder, actions)
      .find((i) => i.label === "Sélectionner pour l'inspecteur")
      ?.onClick?.();
    expect(setSelection).toHaveBeenCalledWith({
      kind: "folder",
      id: "f1",
      label: "Archives Q1",
    });
  });

  it("includes 'Résumer ce dossier' when askMoudir is provided", () => {
    expect(byLabel(buildFolderMenu(folder, actions), "Résumer ce dossier")).toBeDefined();
  });

  it("clicking 'Résumer ce dossier' calls askMoudir with the folder name interpolated", () => {
    buildFolderMenu(folder, actions)
      .find((i) => i.label === "Résumer ce dossier")
      ?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(
      `Résume le contenu du dossier « Archives Q1 » et ses jeux de données.`,
    );
  });
});

describe("buildFolderMenu — partial actions", () => {
  const folder: FolderMenuTarget = { id: "f2", name: "Temp" };

  it("omits openApp entries when openApp is not provided", () => {
    const menu = buildFolderMenu(folder, { askMoudir: vi.fn() });
    expect(byLabel(menu, "Ouvrir le dossier")).toBeUndefined();
    expect(byLabel(menu, "Ouvrir dans une nouvelle fenêtre")).toBeUndefined();
  });

  it("omits askMoudir entry when askMoudir is not provided", () => {
    const menu = buildFolderMenu(folder, { openApp: vi.fn() });
    expect(byLabel(menu, "Résumer ce dossier")).toBeUndefined();
  });

  it("omits setSelection entry when setSelection is not provided", () => {
    const menu = buildFolderMenu(folder, { openApp: vi.fn() });
    expect(byLabel(menu, "Sélectionner pour l'inspecteur")).toBeUndefined();
  });
});

// ─── buildChartMenu ───────────────────────────────────────────────────────────

describe("buildChartMenu — structure", () => {
  const ctx: ChartMenuTarget = { id: "c1", title: "Ventes par canal", appId: "telecom" };

  it("returns an empty array when no actions are provided", () => {
    expect(buildChartMenu(ctx, {})).toHaveLength(0);
  });

  it("never starts with a separator", () => {
    const menu = buildChartMenu(ctx, { setSelection: vi.fn() });
    expect(menu[0]?.separator).toBeFalsy();
  });

  it("never ends with a trailing separator", () => {
    const menu = buildChartMenu(ctx, { setSelection: vi.fn(), askMoudir: vi.fn() });
    expect(menu[menu.length - 1]?.separator).toBeFalsy();
  });

  it("never emits two consecutive separators", () => {
    const menu = buildChartMenu(ctx, {
      setSelection: vi.fn(),
      askMoudir: vi.fn(),
      clearCrossFilter: vi.fn(),
    });
    for (let i = 1; i < menu.length; i++) {
      if (menu[i]?.separator) {
        expect(menu[i - 1]?.separator).toBeFalsy();
      }
    }
  });
});

describe("buildChartMenu — title fallback", () => {
  it("uses 'Graphique' as the title when ctx.title is undefined", () => {
    const askMoudir = vi.fn();
    const menu = buildChartMenu({}, { askMoudir });
    byLabel(menu, "Expliquer ce graphique")?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(expect.stringContaining("Graphique"));
  });

  it("uses 'Graphique' as the title when ctx.title is blank/whitespace", () => {
    const askMoudir = vi.fn();
    const menu = buildChartMenu({ title: "   " }, { askMoudir });
    byLabel(menu, "Expliquer ce graphique")?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(expect.stringContaining("Graphique"));
  });

  it("trims a padded title", () => {
    const askMoudir = vi.fn();
    const menu = buildChartMenu({ title: "  Mon graphique  " }, { askMoudir });
    byLabel(menu, "Expliquer ce graphique")?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(expect.stringContaining("Mon graphique"));
  });
});

describe("buildChartMenu — pin snapshot", () => {
  it("includes 'Épingler sur le bureau' when pinSnapshot + html are provided", () => {
    const pinSnapshot = vi.fn();
    const menu = buildChartMenu(
      { title: "Barres", html: "<svg/>", appId: "telecom" },
      { pinSnapshot },
    );
    expect(byLabel(menu, "Épingler sur le bureau")).toBeDefined();
  });

  it("omits 'Épingler sur le bureau' when html and image are both absent", () => {
    const pinSnapshot = vi.fn();
    const menu = buildChartMenu({ title: "Barres" }, { pinSnapshot });
    expect(byLabel(menu, "Épingler sur le bureau")).toBeUndefined();
  });

  it("omits 'Épingler sur le bureau' when pinSnapshot is not provided", () => {
    const menu = buildChartMenu({ title: "Barres", html: "<svg/>" }, {});
    expect(byLabel(menu, "Épingler sur le bureau")).toBeUndefined();
  });

  it("clicking pin with html calls pinSnapshot with kind='chart'", () => {
    const pinSnapshot = vi.fn();
    const ctx: ChartMenuTarget = { title: "Barres", html: "<svg/>", appId: "telecom" };
    buildChartMenu(ctx, { pinSnapshot })
      .find((i) => i.label === "Épingler sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "chart", html: "<svg/>", appId: "telecom" }),
    );
  });

  it("clicking pin with image calls pinSnapshot with kind='image'", () => {
    const pinSnapshot = vi.fn();
    const ctx: ChartMenuTarget = {
      title: "Screenshot",
      image: "data:image/png;base64,abc",
      appId: "telecom",
    };
    buildChartMenu(ctx, { pinSnapshot })
      .find((i) => i.label === "Épingler sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image", image: "data:image/png;base64,abc" }),
    );
  });

  it("uses 'telecom' as default appId when ctx.appId is not provided", () => {
    const pinSnapshot = vi.fn();
    buildChartMenu({ html: "<div/>" }, { pinSnapshot })
      .find((i) => i.label === "Épingler sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith(expect.objectContaining({ appId: "telecom" }));
  });
});

describe("buildChartMenu — selection", () => {
  it("includes 'Sélectionner pour l'inspecteur' when setSelection is provided", () => {
    const menu = buildChartMenu({ id: "c1", title: "Bar" }, { setSelection: vi.fn() });
    expect(byLabel(menu, "Sélectionner pour l'inspecteur")).toBeDefined();
  });

  it("clicking selection calls setSelection with chart kind, id, label, and meta.datasetId", () => {
    const setSelection = vi.fn();
    buildChartMenu({ id: "c1", title: "Bar", datasetId: "ds1" }, { setSelection })
      .find((i) => i.label === "Sélectionner pour l'inspecteur")
      ?.onClick?.();
    expect(setSelection).toHaveBeenCalledWith({
      kind: "chart",
      id: "c1",
      label: "Bar",
      meta: { datasetId: "ds1" },
    });
  });
});

describe("buildChartMenu — cross-filter", () => {
  it("includes cross-filter entry when dimension + value + setCrossFilter are present", () => {
    const menu = buildChartMenu(
      { title: "Canaux", dimension: "channel", value: "SMS" },
      { setCrossFilter: vi.fn() },
    );
    expect(byLabel(menu, `Filtrer le bureau sur « SMS »`)).toBeDefined();
  });

  it("omits cross-filter entry when dimension is missing", () => {
    const menu = buildChartMenu({ title: "Canaux", value: "SMS" }, { setCrossFilter: vi.fn() });
    expect(byLabel(menu, `Filtrer le bureau sur « SMS »`)).toBeUndefined();
  });

  it("omits cross-filter entry when value is missing", () => {
    const menu = buildChartMenu(
      { title: "Canaux", dimension: "channel" },
      { setCrossFilter: vi.fn() },
    );
    expect(menu.find((i) => i.label?.startsWith("Filtrer le bureau"))).toBeUndefined();
  });

  it("omits cross-filter entry when setCrossFilter is not provided", () => {
    const menu = buildChartMenu({ dimension: "channel", value: "SMS" }, {});
    expect(menu.find((i) => i.label?.startsWith("Filtrer le bureau"))).toBeUndefined();
  });

  it("clicking cross-filter calls setCrossFilter with dimension and value", () => {
    const setCrossFilter = vi.fn();
    buildChartMenu({ dimension: "channel", value: "SMS" }, { setCrossFilter })
      .find((i) => i.label?.startsWith("Filtrer le bureau"))
      ?.onClick?.();
    expect(setCrossFilter).toHaveBeenCalledWith({ dimension: "channel", value: "SMS" });
  });

  it("includes 'Réinitialiser le filtre du bureau' when clearCrossFilter is provided", () => {
    const menu = buildChartMenu({}, { clearCrossFilter: vi.fn() });
    expect(byLabel(menu, "Réinitialiser le filtre du bureau")).toBeDefined();
  });

  it("omits 'Réinitialiser le filtre du bureau' when clearCrossFilter is not provided", () => {
    const menu = buildChartMenu({}, {});
    expect(byLabel(menu, "Réinitialiser le filtre du bureau")).toBeUndefined();
  });

  it("clicking 'Réinitialiser le filtre du bureau' calls clearCrossFilter", () => {
    const clearCrossFilter = vi.fn();
    buildChartMenu({}, { clearCrossFilter })
      .find((i) => i.label === "Réinitialiser le filtre du bureau")
      ?.onClick?.();
    expect(clearCrossFilter).toHaveBeenCalledTimes(1);
  });
});

describe("buildChartMenu — askMoudir", () => {
  it("includes 'Expliquer ce graphique' when askMoudir is provided", () => {
    const menu = buildChartMenu({ title: "Bar" }, { askMoudir: vi.fn() });
    expect(byLabel(menu, "Expliquer ce graphique")).toBeDefined();
  });

  it("prompt without filter: does not mention dimension=value", () => {
    const askMoudir = vi.fn();
    buildChartMenu({ title: "Tendances" }, { askMoudir })
      .find((i) => i.label === "Expliquer ce graphique")
      ?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(
      `Explique le graphique « Tendances » et ses enseignements.`,
    );
  });

  it("prompt with filter: includes dimension and value in the prompt", () => {
    const askMoudir = vi.fn();
    buildChartMenu({ title: "Tendances", dimension: "channel", value: "DATA" }, { askMoudir })
      .find((i) => i.label === "Expliquer ce graphique")
      ?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(
      `Explique le graphique « Tendances » pour channel = DATA.`,
    );
  });
});

// ─── buildKpiMenu ─────────────────────────────────────────────────────────────

describe("buildKpiMenu — structure", () => {
  const kpi: KpiMenuTarget = { key: "successRate", label: "Taux de succès", value: "98%" };

  it("returns an empty array when no actions are provided", () => {
    expect(buildKpiMenu(kpi, {})).toHaveLength(0);
  });

  it("never starts with a separator", () => {
    const menu = buildKpiMenu(kpi, { addWidget: vi.fn() });
    expect(menu[0]?.separator).toBeFalsy();
  });

  it("never ends with a trailing separator", () => {
    const menu = buildKpiMenu(kpi, { addWidget: vi.fn(), openApp: vi.fn() });
    expect(menu[menu.length - 1]?.separator).toBeFalsy();
  });

  it("never emits two consecutive separators", () => {
    const menu = buildKpiMenu(kpi, {
      addWidget: vi.fn(),
      pinSnapshot: vi.fn(),
      askMoudir: vi.fn(),
      openApp: vi.fn(),
    });
    for (let i = 1; i < menu.length; i++) {
      if (menu[i]?.separator) {
        expect(menu[i - 1]?.separator).toBeFalsy();
      }
    }
  });
});

describe("buildKpiMenu — addWidget", () => {
  const kpi: KpiMenuTarget = { key: "totalTx", label: "Total transactions", value: 42000 };

  it("includes 'Ajouter comme widget de bureau' when addWidget is provided", () => {
    const menu = buildKpiMenu(kpi, { addWidget: vi.fn() });
    expect(byLabel(menu, "Ajouter comme widget de bureau")).toBeDefined();
  });

  it("omits addWidget entry when addWidget is not provided", () => {
    const menu = buildKpiMenu(kpi, {});
    expect(byLabel(menu, "Ajouter comme widget de bureau")).toBeUndefined();
  });

  it("clicking addWidget calls addWidget with kpi type and metric config", () => {
    const addWidget = vi.fn();
    buildKpiMenu(kpi, { addWidget })
      .find((i) => i.label === "Ajouter comme widget de bureau")
      ?.onClick?.();
    expect(addWidget).toHaveBeenCalledWith({
      type: "kpi",
      config: { metric: "totalTx", label: "Total transactions" },
    });
  });
});

describe("buildKpiMenu — pinSnapshot", () => {
  const kpi: KpiMenuTarget = { key: "successRate", label: "Taux de succès", value: "98%" };

  it("includes 'Épingler la valeur sur le bureau' when pinSnapshot is provided", () => {
    const menu = buildKpiMenu(kpi, { pinSnapshot: vi.fn() });
    expect(byLabel(menu, "Épingler la valeur sur le bureau")).toBeDefined();
  });

  it("clicking pinSnapshot calls pinSnapshot with answer kind and formatted text", () => {
    const pinSnapshot = vi.fn();
    buildKpiMenu(kpi, { pinSnapshot })
      .find((i) => i.label === "Épingler la valeur sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith({
      title: "Taux de succès",
      kind: "answer",
      appId: "telecom",
      text: "Taux de succès : 98%",
    });
  });

  it("text includes no value suffix when kpi.value is undefined", () => {
    const pinSnapshot = vi.fn();
    const kpiNoVal: KpiMenuTarget = { key: "topError", label: "Top erreur" };
    buildKpiMenu(kpiNoVal, { pinSnapshot })
      .find((i) => i.label === "Épingler la valeur sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith(expect.objectContaining({ text: "Top erreur" }));
  });

  it("text includes no value suffix when kpi.value is null", () => {
    const pinSnapshot = vi.fn();
    const kpiNull = { key: "topError", label: "Top erreur", value: null as unknown as string };
    buildKpiMenu(kpiNull, { pinSnapshot })
      .find((i) => i.label === "Épingler la valeur sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith(expect.objectContaining({ text: "Top erreur" }));
  });

  it("text includes numeric value when kpi.value is a number", () => {
    const pinSnapshot = vi.fn();
    const kpiNum: KpiMenuTarget = { key: "totalTx", label: "Total", value: 42000 };
    buildKpiMenu(kpiNum, { pinSnapshot })
      .find((i) => i.label === "Épingler la valeur sur le bureau")
      ?.onClick?.();
    expect(pinSnapshot).toHaveBeenCalledWith(expect.objectContaining({ text: "Total : 42000" }));
  });
});

describe("buildKpiMenu — setSelection", () => {
  const kpi: KpiMenuTarget = { key: "successRate", label: "Taux de succès", value: "98%" };

  it("includes 'Sélectionner pour l'inspecteur' when setSelection is provided", () => {
    const menu = buildKpiMenu(kpi, { setSelection: vi.fn() });
    expect(byLabel(menu, "Sélectionner pour l'inspecteur")).toBeDefined();
  });

  it("clicking setSelection calls setSelection with kpi kind, key as id, and value in meta", () => {
    const setSelection = vi.fn();
    buildKpiMenu(kpi, { setSelection })
      .find((i) => i.label === "Sélectionner pour l'inspecteur")
      ?.onClick?.();
    expect(setSelection).toHaveBeenCalledWith({
      kind: "kpi",
      id: "successRate",
      label: "Taux de succès",
      meta: { value: "98%" },
    });
  });
});

describe("buildKpiMenu — cross-filter", () => {
  it("includes cross-filter entry when dimension + filterValue + setCrossFilter are present", () => {
    const kpi: KpiMenuTarget = {
      key: "topError",
      label: "Top erreur",
      dimension: "errorCode",
      filterValue: "E002",
    };
    const menu = buildKpiMenu(kpi, { setCrossFilter: vi.fn() });
    expect(byLabel(menu, `Filtrer le bureau sur « E002 »`)).toBeDefined();
  });

  it("omits cross-filter when dimension is missing", () => {
    const kpi: KpiMenuTarget = { key: "k", label: "K", filterValue: "v" };
    const menu = buildKpiMenu(kpi, { setCrossFilter: vi.fn() });
    expect(menu.find((i) => i.label?.startsWith("Filtrer"))).toBeUndefined();
  });

  it("omits cross-filter when filterValue is missing", () => {
    const kpi: KpiMenuTarget = { key: "k", label: "K", dimension: "errorCode" };
    const menu = buildKpiMenu(kpi, { setCrossFilter: vi.fn() });
    expect(menu.find((i) => i.label?.startsWith("Filtrer"))).toBeUndefined();
  });

  it("omits cross-filter when setCrossFilter is not provided", () => {
    const kpi: KpiMenuTarget = {
      key: "k",
      label: "K",
      dimension: "errorCode",
      filterValue: "E002",
    };
    const menu = buildKpiMenu(kpi, {});
    expect(menu.find((i) => i.label?.startsWith("Filtrer"))).toBeUndefined();
  });

  it("clicking cross-filter calls setCrossFilter with dimension and filterValue", () => {
    const setCrossFilter = vi.fn();
    const kpi: KpiMenuTarget = {
      key: "topError",
      label: "Top erreur",
      dimension: "errorCode",
      filterValue: "E002",
    };
    buildKpiMenu(kpi, { setCrossFilter })
      .find((i) => i.label?.startsWith("Filtrer"))
      ?.onClick?.();
    expect(setCrossFilter).toHaveBeenCalledWith({ dimension: "errorCode", value: "E002" });
  });
});

describe("buildKpiMenu — askMoudir", () => {
  it("includes 'Interroger Moudir sur cet indicateur' when askMoudir is provided", () => {
    const kpi: KpiMenuTarget = { key: "k", label: "K" };
    const menu = buildKpiMenu(kpi, { askMoudir: vi.fn() });
    expect(byLabel(menu, "Interroger Moudir sur cet indicateur")).toBeDefined();
  });

  it("prompt includes the label and value when value is present", () => {
    const askMoudir = vi.fn();
    const kpi: KpiMenuTarget = { key: "successRate", label: "Taux de succès", value: "98%" };
    buildKpiMenu(kpi, { askMoudir })
      .find((i) => i.label === "Interroger Moudir sur cet indicateur")
      ?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(
      `Que signifie l'indicateur « Taux de succès » : 98% et comment l'améliorer ?`,
    );
  });

  it("prompt includes just the label when value is undefined", () => {
    const askMoudir = vi.fn();
    const kpi: KpiMenuTarget = { key: "topError", label: "Top erreur" };
    buildKpiMenu(kpi, { askMoudir })
      .find((i) => i.label === "Interroger Moudir sur cet indicateur")
      ?.onClick?.();
    expect(askMoudir).toHaveBeenCalledWith(
      `Que signifie l'indicateur « Top erreur » et comment l'améliorer ?`,
    );
  });
});

describe("buildKpiMenu — openApp telecom", () => {
  const kpi: KpiMenuTarget = { key: "successRate", label: "Taux de succès" };

  it("includes 'Voir le détail dans Télécom' when openApp is provided", () => {
    const menu = buildKpiMenu(kpi, { openApp: vi.fn() });
    expect(byLabel(menu, "Voir le détail dans Télécom")).toBeDefined();
  });

  it("omits 'Voir le détail dans Télécom' when openApp is not provided", () => {
    const menu = buildKpiMenu(kpi, {});
    expect(byLabel(menu, "Voir le détail dans Télécom")).toBeUndefined();
  });

  it("clicking 'Voir le détail dans Télécom' calls openApp with telecom and focusMetric", () => {
    const openApp = vi.fn();
    buildKpiMenu(kpi, { openApp })
      .find((i) => i.label === "Voir le détail dans Télécom")
      ?.onClick?.();
    expect(openApp).toHaveBeenCalledWith("telecom", { props: { focusMetric: "successRate" } });
  });
});

// ─── Internal clean() behavior via public API ─────────────────────────────────

describe("clean() helper behavior (via public builders)", () => {
  it("drops falsy entries — undefined action slots produce no items", () => {
    // buildDatasetMenu with no actions produces [] not [undefined, ...]
    const menu = buildDatasetMenu({ id: "x", name: "X" }, {});
    expect(menu.every((i) => i !== undefined && i !== null)).toBe(true);
    expect(menu).toHaveLength(0);
  });

  it("collapses separator-only output to empty (all items were separators)", () => {
    // When only separators would remain (all actions absent after separators),
    // clean() removes leading/trailing separators and consecutive duplicates.
    // Result: empty array.
    const menu = buildChartMenu({}, {});
    expect(menu).toHaveLength(0);
  });

  it("does not emit a leading separator even when the first real items are absent", () => {
    // pinSnapshot absent, setSelection absent → first emitted item must not be sep
    const menu = buildChartMenu({ title: "Bar" }, { clearCrossFilter: vi.fn() });
    if (menu.length > 0) {
      expect(menu[0].separator).toBeFalsy();
    }
  });
});
