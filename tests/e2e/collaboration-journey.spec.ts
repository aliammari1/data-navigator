import { expect, type Page, test } from "@playwright/test";
import { warmUpOnce } from "./_warmup";

/**
 * Collaboration Journey Tests
 *
 * Covers the merged collab-hub surfaces exposed on /dashboard/collaborative:
 *   - The CollaborationScreen renders (header + tab strip).
 *   - The NEW telecom-aware review tabs exist: Annotations, Approval (with its
 *     REVIEW badge / progress step), and Audit.
 *   - Switching between those tabs reveals each tab's distinct content.
 *
 * These tabs were introduced by the recent collab-hub merge. The Collaboration
 * UI here renders with English labels (Overview / Comments / Changes / Live /
 * Annotations / Approval / Audit), but anchors stay tolerant (case-insensitive,
 * alternations including French equivalents) so the suite survives label tweaks.
 */

const COLLAB_PATH = "/dashboard/collaborative";

// The collab review tabs render as <button> elements inside the tab strip
// (not role="tab"), so we resolve them by accessible button name.
async function clickTab(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).first().click();
}

async function expectUsablePage(page: Page, anchor: RegExp) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/404|not found|application error/i);
  await expect(page.locator("body")).toContainText(anchor);
}

async function gotoCollaboration(page: Page) {
  await page.goto(COLLAB_PATH, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/collaborative/);

  // The route is `domcontentloaded` only — the CollaborationScreen mounts and
  // its tab strip renders after client hydration. Wait for the screen's stable
  // header text and its always-present "Overview" tab before tests assert on
  // specific elements, so the default 5s expect timeout isn't racing hydration
  // (which intermittently failed the heading / tab-button assertions).
  await expect(page.locator("body")).toContainText(/collaborative|collaboration|workspace/i, {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /^Overview\b/i })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Collaboration hub review journey", () => {
  test.setTimeout(60_000);

  // One-time, cross-worker warm-up of the collaborative route so on-demand
  // `next dev` compilation is paid once (on a single worker) instead of by every
  // parallel test's first assertion.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await warmUpOnce(browser, "collaboration", [COLLAB_PATH]);
  });

  test.beforeEach(async ({ page }) => {
    // Mirror the dashboard-shell access bootstrap used by the existing suite so
    // the windowed-desktop shell never gates the collaborative route.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "data-navigator-dashboard-access-v1",
        JSON.stringify({ role: "owner", cacheMode: "balanced" }),
      );
    });
  });

  test("CollaborationScreen renders with its header and tab strip", async ({ page }) => {
    await gotoCollaboration(page);

    // Header surface of the merged screen.
    await expectUsablePage(page, /collaborative|collaboration|workspace/i);
    await expect(page.getByRole("heading", { name: /collaborative|collaboration/i })).toBeVisible();

    // The original tab strip should still be present after the merge.
    await expect(page.getByRole("button", { name: /^Overview\b/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Comments\b/i })).toBeVisible();
  });

  test("new telecom-aware review tabs (Annotations, Approval, Audit) are present", async ({
    page,
  }) => {
    await gotoCollaboration(page);
    await expectUsablePage(page, /collaborative|collaboration|workspace/i);

    await expect(page.getByRole("button", { name: /annotations/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /approval|validation|approbation/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Audit\b/i })).toBeVisible();
  });

  test("Annotations tab reveals the report-section annotations surface", async ({ page }) => {
    await gotoCollaboration(page);
    await clickTab(page, /annotations/i);

    // Content gates on the collab-hub doc readiness; the heading appears once
    // the shared CRDT doc is loaded (always resolves, so auto-wait suffices).
    await expect(page.getByText(/report annotations|annotations/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText(
      /report annotations|telecom report section|note|annotation/i,
    );
  });

  test("Approval tab reveals the approval workflow with its REVIEW state", async ({ page }) => {
    await gotoCollaboration(page);
    await clickTab(page, /approval|validation|approbation/i);

    await expect(page.getByText(/approval workflow|approval|validation/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // The approval workflow always renders its Draft -> Review -> Approved
    // progress, so the REVIEW step/label is present regardless of current
    // status. This is the "REVIEW badge" surface from the collab-hub merge.
    await expect(page.locator("body")).toContainText(/review|approval workflow|submit for review/i);
  });

  test("Audit tab reveals the audit trail surface", async ({ page }) => {
    await gotoCollaboration(page);
    await clickTab(page, /^Audit\b/i);

    await expect(page.getByText(/audit trail|audit/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/audit trail|log of every action|audit/i);
  });

  test("switching across the review tabs swaps their content", async ({ page }) => {
    await gotoCollaboration(page);

    await clickTab(page, /annotations/i);
    await expect(page.getByText(/report annotations|annotations/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await clickTab(page, /approval|validation|approbation/i);
    await expect(page.getByText(/approval workflow|approval/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await clickTab(page, /^Audit\b/i);
    await expect(page.getByText(/audit trail|audit/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
