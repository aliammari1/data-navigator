/**
 * Behavioral tests for @/features/desktop/core/app-registry
 *
 * The module is a static registry — no IO, no hooks, no network.
 * We mock next/dynamic so the lazy loaders never actually execute,
 * and lucide-react so icon components resolve cleanly in jsdom.
 *
 * Coverage targets:
 *  - DESKTOP_APPS array structure and completeness
 *  - getApp() happy path and miss
 *  - LAUNCHER_APPS and PINNED_APPS derived arrays
 *  - Every property contract on DesktopApp
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Capture every (loader, opts) pair passed to dynamic() so tests can invoke
// the loaders and the loading component — covering the otherwise-dead closures.
const dynamicCalls = vi.hoisted(
  () =>
    [] as Array<{
      loader: () => Promise<unknown>;
      opts: { ssr?: boolean; loading?: () => JSX.Element };
    }>,
);

// next/dynamic must be mocked before the registry module loads.
vi.mock("next/dynamic", () => ({
  // Return a stable placeholder component so `Component` fields are truthy.
  // Also record each call so tests can invoke loaders and loading components.
  default: vi.fn(
    (loader: () => Promise<unknown>, opts?: { ssr?: boolean; loading?: () => JSX.Element }) => {
      dynamicCalls.push({ loader, opts: opts ?? {} });
      const Placeholder = () => null;
      Placeholder.displayName = "DynamicPlaceholder";
      return Placeholder;
    },
  ),
}));

// Mock lucide-react icons the registry itself uses (cheap, stable stubs), and
// fall back to the REAL exports (via importOriginal) for everything else. This
// test's captured dynamic() loaders transitively import whichever screens the
// desktop registry lazy-loads, so the icon surface here is effectively
// "every icon any screen in the app uses", not just the registry's own icons —
// a hand-enumerated list drifts every time a screen adds a new icon. Falling
// back to the real component for unlisted icons removes that maintenance trap
// (per vitest's own guidance for partial-mocking a module).
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  const icon = (name: string) => {
    const C = () => null;
    C.displayName = name;
    return C;
  };
  return {
    ...actual,
    Activity: icon("Activity"),
    BarChart3: icon("BarChart3"),
    Bot: icon("Bot"),
    Brain: icon("Brain"),
    Clapperboard: icon("Clapperboard"),
    Database: icon("Database"),
    Eye: icon("Eye"),
    FileSpreadsheet: icon("FileSpreadsheet"),
    FileText: icon("FileText"),
    FlaskConical: icon("FlaskConical"),
    Folders: icon("Folders"),
    Gauge: icon("Gauge"),
    GitBranch: icon("GitBranch"),
    HelpCircle: icon("HelpCircle"),
    History: icon("History"),
    LayoutDashboard: icon("LayoutDashboard"),
    Map: icon("Map"),
    MessageCircle: icon("MessageCircle"),
    Microscope: icon("Microscope"),
    Radio: icon("Radio"),
    Receipt: icon("Receipt"),
    Scale: icon("Scale"),
    Settings: icon("Settings"),
    Sparkles: icon("Sparkles"),
    Table2: icon("Table2"),
    Trash2: icon("Trash2"),
    TrendingUp: icon("TrendingUp"),
    Trophy: icon("Trophy"),
    Upload: icon("Upload"),
    Users: icon("Users"),
  };
});

// Mock all the feature screen imports so the dynamic loaders are never
// actually resolved (they return undefined — the loader fn never runs in tests
// because next/dynamic itself is mocked above).
vi.mock("@/features/dashboard-home/screens/DashboardHomeScreen", () => ({ default: () => null }));
vi.mock("@/features/data-formulator/screens/FormulatorScreen", () => ({ default: () => null }));
vi.mock("@/features/data-formulator/screens/MoudirAssistantScreen", () => ({
  default: () => null,
}));
vi.mock("@/features/ai-commander/screens/CommanderScreen", () => ({ default: () => null }));
vi.mock("@/features/eye-tracking/screens/EyeTrackingScreen", () => ({ default: () => null }));
vi.mock("@/features/ai-briefing/screens/AIBriefingScreen", () => ({ default: () => null }));
vi.mock("@/features/ai-analysis/screens/AiAnalysisScreen", () => ({ default: () => null }));
vi.mock("@/features/deep-analytics/screens/DeepAnalyticsScreen", () => ({
  DeepAnalyticsScreen: () => null,
}));
vi.mock("@/features/forecast-intelligence/screens/ForecastScreen", () => ({
  ForecastScreen: () => null,
}));
vi.mock("@/features/geo-analysis/screens/GeoAnalysisScreen", () => ({ default: () => null }));
vi.mock("@/features/channel-monitor/screens/ChannelMonitorScreen", () => ({
  ChannelMonitorScreen: () => null,
}));
vi.mock("@/features/data-import/screens/DataImportScreen", () => ({ default: () => null }));
vi.mock("@/features/csv-parser/screens/CsvParserScreen", () => ({ default: () => null }));
vi.mock("@/features/folders/screens/FoldersScreen", () => ({ default: () => null }));
vi.mock("@/features/parsed-data/screens/ParsedDataScreen", () => ({ default: () => null }));
vi.mock("@/features/data-browser/screens/DataBrowserScreen", () => ({ default: () => null }));
vi.mock("@/features/data-transform/screens/DataTransformScreen", () => ({ default: () => null }));
vi.mock("@/features/lineage/screens/LineageScreen", () => ({ default: () => null }));
vi.mock("@/features/reconciliation/screens/ReconciliationScreen", () => ({
  ReconciliationScreen: () => null,
}));
vi.mock("@/features/history/screens/HistoryScreen", () => ({ default: () => null }));
vi.mock("@/features/report-studio/screens/ReportStudioScreen", () => ({
  ReportStudioScreen: () => null,
}));
vi.mock("@/features/analytics-theater/screens/AnalyticsTheaterScreen", () => ({
  AnalyticsTheaterScreen: () => null,
}));
vi.mock("@/features/collaboration/screens/CollaborationHostedScreen", () => ({
  default: () => null,
}));
vi.mock("@/features/agent-canvas/screens/AgentCanvasScreen", () => ({ default: () => null }));
vi.mock("@/features/ux-innovations/screens/UxInnovationsScreen", () => ({ default: () => null }));
vi.mock("@/features/dashboard-shell/screens/shell-overview-screen", () => ({
  ShellOverviewScreen: () => null,
}));
vi.mock("@/features/help/screens/HelpScreen", () => ({ default: () => null }));
vi.mock("@/features/desktop/apps/RecycleBinScreen", () => ({ default: () => null }));
vi.mock("@/features/desktop/screens/TelecomDesktopScreen", () => ({
  TelecomDesktopScreen: () => null,
}));
vi.mock("@/features/settings/screens/SettingsScreen", () => ({ default: () => null }));

// ── Import the real module AFTER mocks are registered ────────────────────────
import {
  DESKTOP_APPS,
  type DesktopApp,
  getApp,
  LAUNCHER_APPS,
  PINNED_APPS,
} from "@/features/desktop/core/app-registry";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Known IDs that must exist in the registry. */
const KNOWN_IDS = [
  "home",
  "moudir",
  "moudir-chat",
  "commander",
  "eye-tracking",
  "telecom",
  "ai-briefing",
  "ai-analysis",
  "deep-analytics",
  "forecast",
  "geo",
  "monitor",
  "upload",
  "csv-parser",
  "folders",
  "parsed",
  "data-browser",
  "transform",
  "lineage",
  "reconciliation",
  "history",
  "report-studio",
  "theater",
  "collaboration",
  "agent-canvas",
  "ux-innovations",
  "diagnostics",
  "help",
  "recycle-bin",
  "settings",
] as const;

// ── DESKTOP_APPS ─────────────────────────────────────────────────────────────

describe("DESKTOP_APPS", () => {
  it("is a non-empty array", () => {
    // Arrange / Act: imported at module level
    // Assert
    expect(Array.isArray(DESKTOP_APPS)).toBe(true);
    expect(DESKTOP_APPS.length).toBeGreaterThan(0);
  });

  it("contains exactly 30 app entries", () => {
    // Cross-checked against the 30 entries defined in the source file.
    expect(DESKTOP_APPS).toHaveLength(30);
  });

  it("every entry has a non-empty string id", () => {
    for (const app of DESKTOP_APPS) {
      expect(typeof app.id).toBe("string");
      expect(app.id.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty string title", () => {
    for (const app of DESKTOP_APPS) {
      expect(typeof app.title).toBe("string");
      expect(app.title.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty string blurb", () => {
    for (const app of DESKTOP_APPS) {
      expect(typeof app.blurb).toBe("string");
      expect(app.blurb.length).toBeGreaterThan(0);
    }
  });

  it("every entry has an icon (function/component)", () => {
    for (const app of DESKTOP_APPS) {
      expect(typeof app.icon).toBe("function");
    }
  });

  it("every hue is a number in [0, 360]", () => {
    for (const app of DESKTOP_APPS) {
      expect(typeof app.hue).toBe("number");
      expect(app.hue).toBeGreaterThanOrEqual(0);
      expect(app.hue).toBeLessThanOrEqual(360);
    }
  });

  it("every defaultSize has positive integer w and h", () => {
    for (const app of DESKTOP_APPS) {
      expect(app.defaultSize).toBeDefined();
      expect(app.defaultSize.w).toBeGreaterThan(0);
      expect(app.defaultSize.h).toBeGreaterThan(0);
    }
  });

  it("all IDs are unique", () => {
    const ids = DESKTOP_APPS.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("contains all known required app IDs", () => {
    const ids = new Set(DESKTOP_APPS.map((a) => a.id));
    for (const id of KNOWN_IDS) {
      expect(ids.has(id), `Missing expected app id: ${id}`).toBe(true);
    }
  });

  it("every entry has either a Component or a route (but not necessarily both)", () => {
    for (const app of DESKTOP_APPS) {
      const hasComponent = app.Component !== undefined;
      const hasRoute = typeof app.route === "string" && app.route.length > 0;
      expect(hasComponent || hasRoute, `App "${app.id}" has neither Component nor route`).toBe(
        true,
      );
    }
  });

  it("singleInstance is boolean or undefined when present", () => {
    for (const app of DESKTOP_APPS) {
      if (app.singleInstance !== undefined) {
        expect(typeof app.singleInstance).toBe("boolean");
      }
    }
  });

  it("inLauncher is boolean or undefined when present", () => {
    for (const app of DESKTOP_APPS) {
      if (app.inLauncher !== undefined) {
        expect(typeof app.inLauncher).toBe("boolean");
      }
    }
  });

  it("pinned is boolean or undefined when present", () => {
    for (const app of DESKTOP_APPS) {
      if (app.pinned !== undefined) {
        expect(typeof app.pinned).toBe("boolean");
      }
    }
  });
});

// ── Individual app properties ─────────────────────────────────────────────────

describe("individual app property contracts", () => {
  it("home is singleInstance, inLauncher, and pinned", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "home")!;
    expect(app.singleInstance).toBe(true);
    expect(app.inLauncher).toBe(true);
    expect(app.pinned).toBe(true);
  });

  it("home has a Component (not a route)", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "home")!;
    expect(app.Component).toBeDefined();
    expect(app.route).toBeUndefined();
  });

  it("telecom uses a native Component (shares IPC bridge + stores), not a route", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "telecom")!;
    expect(app.Component).toBeDefined();
    expect(app.route).toBeUndefined();
  });

  it("recycle-bin has inLauncher set to false", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "recycle-bin")!;
    expect(app.inLauncher).toBe(false);
  });

  it("settings is singleInstance, inLauncher, and pinned", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "settings")!;
    expect(app.singleInstance).toBe(true);
    expect(app.inLauncher).toBe(true);
    expect(app.pinned).toBe(true);
  });

  it("commander is singleInstance and pinned", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "commander")!;
    expect(app.singleInstance).toBe(true);
    expect(app.pinned).toBe(true);
  });

  it("moudir is singleInstance and pinned", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "moudir")!;
    expect(app.singleInstance).toBe(true);
    expect(app.pinned).toBe(true);
  });

  it("diagnostics is singleInstance", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "diagnostics")!;
    expect(app.singleInstance).toBe(true);
  });

  it("telecom is singleInstance and inLauncher", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "telecom")!;
    expect(app.singleInstance).toBe(true);
    expect(app.inLauncher).toBe(true);
  });

  it("ai-briefing has no singleInstance (it is undefined)", () => {
    // ai-briefing is NOT singleInstance — multiple briefing windows are allowed.
    const app = DESKTOP_APPS.find((a) => a.id === "ai-briefing")!;
    expect(app.singleInstance).toBeUndefined();
  });

  it("home defaultSize is 1100 x 760", () => {
    // Cross-checked against the source.
    const app = DESKTOP_APPS.find((a) => a.id === "home")!;
    expect(app.defaultSize).toEqual({ w: 1100, h: 760 });
  });

  it("recycle-bin defaultSize is 620 x 540", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "recycle-bin")!;
    expect(app.defaultSize).toEqual({ w: 620, h: 540 });
  });

  it("telecom hue is 18", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "telecom")!;
    expect(app.hue).toBe(18);
  });

  it("moudir hue is 268", () => {
    const app = DESKTOP_APPS.find((a) => a.id === "moudir")!;
    expect(app.hue).toBe(268);
  });
});

// ── getApp ───────────────────────────────────────────────────────────────────

describe("getApp", () => {
  it("returns the correct app for a known id", () => {
    // Arrange
    const expected = DESKTOP_APPS.find((a) => a.id === "home");

    // Act
    const result = getApp("home");

    // Assert
    expect(result).toBe(expected);
  });

  it("returns undefined for an unknown id", () => {
    expect(getApp("does-not-exist")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getApp("")).toBeUndefined();
  });

  it("is case-sensitive (uppercase id is not found)", () => {
    // The MAP key is the lowercase id; uppercase misses.
    expect(getApp("HOME")).toBeUndefined();
  });

  it("returns each known app by id", () => {
    for (const id of KNOWN_IDS) {
      const app = getApp(id);
      expect(app, `getApp("${id}") should return an app`).toBeDefined();
      expect(app!.id).toBe(id);
    }
  });

  it("returns the telecom app with its native Component", () => {
    const app = getApp("telecom");
    expect(app?.Component).toBeDefined();
    expect(app?.route).toBeUndefined();
  });

  it("returned app object is the same reference as in DESKTOP_APPS", () => {
    // Verifies the implementation uses the MAP (identity lookup, not a clone).
    const fromMap = getApp("settings");
    const fromArray = DESKTOP_APPS.find((a) => a.id === "settings");
    expect(fromMap).toBe(fromArray);
  });
});

// ── LAUNCHER_APPS ─────────────────────────────────────────────────────────────

describe("LAUNCHER_APPS", () => {
  it("is a subset of DESKTOP_APPS", () => {
    for (const app of LAUNCHER_APPS) {
      expect(DESKTOP_APPS).toContain(app);
    }
  });

  it("contains only apps where inLauncher !== false", () => {
    for (const app of LAUNCHER_APPS) {
      expect(app.inLauncher).not.toBe(false);
    }
  });

  it("excludes the recycle-bin app (inLauncher: false)", () => {
    const ids = LAUNCHER_APPS.map((a) => a.id);
    expect(ids).not.toContain("recycle-bin");
  });

  it("includes the home app (inLauncher: true)", () => {
    const ids = LAUNCHER_APPS.map((a) => a.id);
    expect(ids).toContain("home");
  });

  it("includes the settings app (inLauncher: true)", () => {
    const ids = LAUNCHER_APPS.map((a) => a.id);
    expect(ids).toContain("settings");
  });

  it("includes the telecom app", () => {
    const ids = LAUNCHER_APPS.map((a) => a.id);
    expect(ids).toContain("telecom");
  });

  it("has fewer entries than DESKTOP_APPS (recycle-bin is excluded)", () => {
    expect(LAUNCHER_APPS.length).toBeLessThan(DESKTOP_APPS.length);
  });

  it("has exactly 29 entries (all apps minus recycle-bin)", () => {
    // 30 total apps, 1 with inLauncher:false → 29 launcher apps
    expect(LAUNCHER_APPS).toHaveLength(29);
  });
});

// ── PINNED_APPS ───────────────────────────────────────────────────────────────

describe("PINNED_APPS", () => {
  it("is a subset of DESKTOP_APPS", () => {
    for (const app of PINNED_APPS) {
      expect(DESKTOP_APPS).toContain(app);
    }
  });

  it("contains only apps with pinned: true", () => {
    for (const app of PINNED_APPS) {
      expect(app.pinned).toBe(true);
    }
  });

  it("includes home (pinned: true)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).toContain("home");
  });

  it("includes settings (pinned: true)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).toContain("settings");
  });

  it("includes moudir (pinned: true)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).toContain("moudir");
  });

  it("includes commander (pinned: true)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).toContain("commander");
  });

  it("includes eye-tracking (pinned: true)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).toContain("eye-tracking");
  });

  it("includes telecom (pinned: true)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).toContain("telecom");
  });

  it("does not include ai-briefing (pinned is not set)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).not.toContain("ai-briefing");
  });

  it("does not include recycle-bin (not pinned)", () => {
    const ids = PINNED_APPS.map((a) => a.id);
    expect(ids).not.toContain("recycle-bin");
  });

  it("has exactly 7 pinned apps", () => {
    // home, moudir, moudir-chat, commander, eye-tracking, telecom, settings
    expect(PINNED_APPS).toHaveLength(7);
  });

  it("every pinned app is also in LAUNCHER_APPS or at least in DESKTOP_APPS", () => {
    for (const app of PINNED_APPS) {
      expect(DESKTOP_APPS).toContain(app);
    }
  });
});

// ── Type-level shape contract ─────────────────────────────────────────────────

describe("DesktopApp type shape at runtime", () => {
  it("every app has an id, title, blurb, icon, hue, and defaultSize", () => {
    const requiredKeys: (keyof DesktopApp)[] = [
      "id",
      "title",
      "blurb",
      "icon",
      "hue",
      "defaultSize",
    ];
    for (const app of DESKTOP_APPS) {
      for (const key of requiredKeys) {
        expect(app[key], `App "${app.id}" is missing key "${key}"`).toBeDefined();
      }
    }
  });

  it("optional keys (route, singleInstance, inLauncher, pinned, Component) are absent or typed correctly", () => {
    for (const app of DESKTOP_APPS) {
      if (app.route !== undefined) expect(typeof app.route).toBe("string");
      if (app.singleInstance !== undefined) expect(typeof app.singleInstance).toBe("boolean");
      if (app.inLauncher !== undefined) expect(typeof app.inLauncher).toBe("boolean");
      if (app.pinned !== undefined) expect(typeof app.pinned).toBe("boolean");
      if (app.Component !== undefined) expect(typeof app.Component).toBe("function");
    }
  });
});

// ── dynamic() loader invocation (covers the `d()` helper + all loader lambdas) ──────────────────

describe("dynamic loader invocation via captured calls", () => {
  // dynamicCalls (populated by vi.hoisted + the updated mock) contains every
  // (loader, opts) pair the registry passed to dynamic() while building DESKTOP_APPS.
  // Invoking the captured loaders exercises:
  //   • the `() => import(...)` lambda inside each d() call (lines 107-420)
  //   • the `name ? () => loader().then(m => m[name]) : loader` branch (line 91)
  // Both paths are needed to reach 100 % branch coverage on the ternary.

  it("dynamic was called once per Component-bearing app (all 30 apps)", () => {
    // Every app in the registry now carries a Component (telecom included).
    expect(dynamicCalls.length).toBe(30);
  });

  it("every captured dynamic call received ssr:false and a loading option", () => {
    for (const { opts } of dynamicCalls) {
      expect(opts.ssr).toBe(false);
      expect(typeof opts.loading).toBe("function");
    }
  });

  it("invoking a no-name loader (default-export branch) resolves to a component", async () => {
    // The home app (index 0) uses d() without a name — loader is the raw import lambda.
    // Calling it returns { default: Component } because the feature module is mocked above.
    const { loader } = dynamicCalls[0];
    const result = await loader();
    // The mock returns { default: () => null }
    expect(result).toBeDefined();
    expect(typeof (result as { default: unknown }).default).toBe("function");
  }, 10000);

  it("invoking all captured loaders resolves without throwing", async () => {
    for (const { loader } of dynamicCalls) {
      await expect(loader()).resolves.toBeDefined();
    }
  }, 30000);

  it("name-branch loader resolves to the named export directly", async () => {
    // Apps that use d(loader, name) wrap the loader: () => loader().then(m => m[name]).
    // Those wrapped loaders return a function directly (the named export component)
    // instead of a { default: fn } object.
    // deep-analytics (index 7) uses "DeepAnalyticsScreen"; its mock returns
    // { DeepAnalyticsScreen: () => null }.
    const namedResults: unknown[] = [];
    for (const { loader } of dynamicCalls) {
      const result = await loader();
      // Named-export loaders resolve to a plain function (after .then(m => m[name])).
      // Default-export loaders resolve to { default: fn }.
      if (typeof result === "function") {
        namedResults.push(result);
      }
    }
    // Apps using named exports: deep-analytics, forecast, monitor, reconciliation,
    // report-studio, theater, diagnostics — at least one must be a plain function.
    expect(namedResults.length).toBeGreaterThan(0);
  }, 30000);
});

// ── loading component rendering (covers lines 51-57) ─────────────────────────

describe("loading component", () => {
  it("renders without throwing", () => {
    // The `loading` function is passed as opts.loading to every dynamic() call.
    // Extract it from the first captured call and render it to cover the JSX.
    const LoadingComponent = dynamicCalls[0].opts.loading!;
    expect(() => render(<LoadingComponent />)).not.toThrow();
  });

  it("loading component renders the ping animation container", () => {
    const LoadingComponent = dynamicCalls[0].opts.loading!;
    const { container } = render(<LoadingComponent />);
    // The outer div uses place-items-center grid layout.
    const outer = container.querySelector("div");
    expect(outer).not.toBeNull();
    // There is a nested flex container with the spinner span.
    const inner = container.querySelector("div > div");
    expect(inner).not.toBeNull();
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    // The span carries the animate-ping class.
    expect(span?.className).toContain("animate-ping");
  });
});
