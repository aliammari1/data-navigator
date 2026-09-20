import { expect, type Page, test } from "@playwright/test";
import { warmUpOnce } from "./_warmup";

/**
 * Desktop Workspace Journey
 *
 * The `/dashboard` route boots into the Puter-style windowed desktop shell by
 * default (`desktopMode: true` in the shell store + `pathname === "/dashboard"`),
 * which replaces the classic sidebar layout. This suite exercises that default
 * shell:
 *   1. the dock + desktop canvas render,
 *   2. the Launchpad ("Applications") opens its frosted app grid,
 *   3. launching apps (Rapport Télécom, Paramètres) floats a window.
 *
 * Locators stay resilient to the windowed shell: dock items expose their label
 * via `title` (and a tooltip span), the desktop canvas carries the stable
 * `.dn-desktop-canvas` class, windows carry `.dn-window`, and every window
 * titlebar surfaces the app title plus a French "Fermer" close control. The UI
 * is French, so anchors match French labels case-insensitively with tolerant
 * alternations.
 */

const ACCESS_KEY = "data-navigator-dashboard-access-v1";

/**
 * Land on the desktop shell. Mirrors the access-localStorage seeding the rest
 * of the e2e suite uses so the LAN access gate never intercepts the route, then
 * waits for the dock — the most reliable "desktop is live" signal.
 */
async function gotoDesktop(page: Page) {
  await page.addInitScript(
    ([key]) => {
      window.localStorage.setItem(key, JSON.stringify({ role: "owner", cacheMode: "balanced" }));
    },
    [ACCESS_KEY],
  );

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expect(page.locator("body")).not.toContainText(/404|not found|application error/i);
  await expect(dock(page)).toBeVisible({ timeout: 45_000 });
  // The dock renders before React finishes hydrating its handlers; if a click
  // lands too early it is dropped. Wait (briefly, best-effort) for the network
  // to settle so the client bundle has executed and the dock is interactive.
  // Bounded because the Next.js dev "Compiling…" widget polls and can keep the
  // network perpetually busy, which would otherwise stall until the test
  // timeout. `openLauncher`'s retry loop covers any residual hydration lag.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

/** The desktop canvas — wallpaper + window/icon host (stable class hook). */
function canvas(page: Page) {
  return page.locator(".dn-desktop-canvas");
}

/** The floating dock pill: the Launchpad lives at its left edge. */
function dock(page: Page) {
  return page.getByRole("button", { name: /applications/i }).first();
}

/**
 * A *visible* desktop window matching `text`. The canvas can hold hidden
 * `.dn-window` nodes (minimised frames, in-flight open/close animations, and
 * the "Instantané" snapshot tile all carry app text), so an unscoped
 * `.filter({ hasText }).first()` can resolve to a hidden frame and never become
 * visible. The `:visible` pseudo-class restricts the match to a frame that is
 * actually on screen.
 */
function visibleWindow(page: Page, text: RegExp) {
  return page.locator(".dn-window:visible").filter({ hasText: text });
}

/** The Launchpad's centered search field — the "launcher is open" signal. */
function launcherSearch(page: Page) {
  return page.getByPlaceholder(/rechercher/i);
}

/**
 * The frosted Launchpad overlay (`fixed inset-0 z-palette`), scoped via the
 * search field it contains. App tiles must be clicked *through this overlay* —
 * the same app label also exists on the dock button underneath, and that dock
 * button is covered by the overlay, so an unscoped `.first()` resolves to the
 * dock and the click is intercepted. Scoping to the overlay targets the grid
 * tile instead.
 */
function launcherOverlay(page: Page) {
  return page
    .locator("div.fixed.inset-0")
    .filter({ has: launcherSearch(page) })
    .first();
}

/** A specific app tile *inside* the open Launchpad grid (not the dock). */
function launcherTile(page: Page, name: RegExp) {
  return launcherOverlay(page).getByRole("button", { name }).first();
}

/**
 * Open the Launchpad and wait for its search field to settle.
 *
 * The dock's Launchpad button is a *toggle* (`toggleLauncher`) wired up by React
 * on hydration. Under `next dev` the dock can paint before hydration completes,
 * so the very first click is occasionally dropped — leaving the launcher closed.
 * A naive double-click would toggle it back shut, so we click once, wait for the
 * search field, and only re-click when it is genuinely still absent. We confirm
 * the dock button is interactive first to minimise the dropped-click window.
 */
async function openLauncher(page: Page) {
  const button = dock(page);
  await expect(button).toBeVisible();
  const search = launcherSearch(page);

  for (let attempt = 0; attempt < 3; attempt++) {
    // Re-click only when the launcher is not already open (avoid toggling shut).
    if (!(await search.isVisible().catch(() => false))) {
      await button.click();
    }
    try {
      await expect(search).toBeVisible({ timeout: 5_000 });
      return;
    } catch {
      // Dropped click (pre-hydration) — settle and retry the open.
      await page.waitForTimeout(500);
    }
  }

  // Final assertion surfaces a clear failure if the launcher never opened.
  await expect(search).toBeVisible({ timeout: 5_000 });
}

test.describe("Desktop workspace journey", () => {
  // Each test re-navigates with its own page, so the cases are independent.
  // Running them in parallel (not serial) means one failure isolates instead
  // of skipping the rest of the group.
  test.setTimeout(60_000);

  // One-time, cross-worker warm-up of the desktop shell so on-demand `next dev`
  // compilation of the /dashboard route tree is paid once (on a single worker)
  // instead of by every parallel test's first navigation.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await warmUpOnce(browser, "desktop", ["/dashboard"]);
  });

  test("dashboard boots into the windowed desktop shell with a dock and canvas", async ({
    page,
  }) => {
    await gotoDesktop(page);

    // Desktop canvas (wallpaper + window host) is present.
    await expect(canvas(page)).toBeVisible();

    // The dock pill exposes the Launchpad ("Applications") and the Trash
    // ("Corbeille") — both confirm we are in the windowed shell, not the
    // classic sidebar layout.
    await expect(dock(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /corbeille/i }).first()).toBeVisible();

    // A pinned dock app (Rapport Télécom) is reachable straight from the dock.
    await expect(
      page.getByRole("button", { name: /rapport t[ée]l[ée]com/i }).first(),
    ).toBeVisible();
  });

  test("the Launchpad opens a searchable grid of applications", async ({ page }) => {
    await gotoDesktop(page);
    await openLauncher(page);

    // The grid lists pinned/native apps by their French titles.
    await expect(page.getByText(/rapport t[ée]l[ée]com/i).first()).toBeVisible();
    await expect(page.getByText(/param[èe]tres/i).first()).toBeVisible();

    // Searching narrows the grid; an unknown term shows the empty state.
    await launcherSearch(page).fill("zzz-no-such-app");
    await expect(page.getByText(/aucune application ne correspond/i)).toBeVisible();
  });

  test("launching Paramètres from the Launchpad floats a window", async ({ page }) => {
    await gotoDesktop(page);
    await openLauncher(page);

    // Click the Paramètres tile *in the Launchpad grid* (not the dock button
    // beneath the frosted overlay, which the overlay would intercept).
    await launcherTile(page, /param[èe]tres/i).click();

    // A desktop window frame appears, titled "Paramètres", with the standard
    // French window controls ("Fermer" close button). Scope to a *visible*
    // window so a hidden/animating frame can't satisfy the match.
    await expect(visibleWindow(page, /param[èe]tres/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^fermer$/i }).first()).toBeVisible();
  });

  test("launching Rapport Télécom from the dock floats a windowed report", async ({ page }) => {
    await gotoDesktop(page);

    // Rapport Télécom is a pinned dock app — launch it straight from the dock.
    await page
      .getByRole("button", { name: /rapport t[ée]l[ée]com/i })
      .first()
      .click();

    // Rapport Télécom is a native React desktop screen, not an iframe. Assert
    // the real window frame and its stable report surface instead of coupling
    // this journey to an obsolete hosting implementation.
    const reportWindow = visibleWindow(page, /rapport t[ée]l[ée]com/i).first();
    await expect(reportWindow).toBeVisible({ timeout: 15_000 });
    await expect(reportWindow).toContainText(/rapport|télécom|telecom|importer|aucun rapport/i);
  });

  test("right-clicking the empty desktop opens its context menu", async ({ page }) => {
    await gotoDesktop(page);
    await expect(canvas(page)).toBeVisible();

    // Empty-area right-clicks land on the full-bleed click-away surface, not the
    // bare canvas: `.dn-desktop-canvas` isolates a stacking context, so the
    // click-away/marquee layer (`[data-desktop-surface]`, z-index -10) paints
    // above the wallpaper and becomes the hit target. Dispatch the contextmenu
    // there so the assertion is deterministic regardless of which default
    // windows float over the canvas centre — this is the exact path the desktop
    // menu must recognise (regressed when the handler only matched the canvas).
    const surface = page.locator("[data-desktop-surface]").first();
    await expect(surface).toBeAttached();
    await surface.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 320,
      clientY: 320,
      button: 2,
    });

    // The desktop menu surfaces its French actions; "Mode classique" is a stable
    // entry unique to this menu.
    await expect(page.getByRole("button", { name: /mode classique/i }).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("multiple apps can be open as distinct desktop windows", async ({ page }) => {
    await gotoDesktop(page);

    const onScreen = page.locator(".dn-window:visible");

    // The persisted desktop store intentionally starts with no windows. Open two
    // apps through the same Launchpad interaction a user follows.
    await openLauncher(page);
    await launcherTile(page, /param[èe]tres/i).click();
    await expect(visibleWindow(page, /param[èe]tres/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await openLauncher(page);
    await launcherTile(page, /explorateur/i).click();

    await expect(visibleWindow(page, /explorateur/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => onScreen.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  });
});
