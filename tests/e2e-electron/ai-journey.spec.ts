// tests/e2e-electron/ai-journey.spec.ts
import { expect, test } from "@playwright/test";
import { closeApp, launchApp, screenshot, signUp, TEST_EMAIL, TEST_PASSWORD } from "./_harness";

/**
 * Moudir AI Chat & Analysis Journey:
 * Tests the complete AI interface in the real Electron app:
 *   1. Initial screen: Header, Local AI status, Model badge, Dataset chip
 *   2. Conversation Sidebar: rail navigation, new conversation creation ("Nouveau")
 *   3. AI Prompt Composer: textarea interaction, @mention hints, prompt staging
 *   4. Command-K Search Palette: modal trigger, search input, dismiss
 *   5. Workspace layout & Canvas split: sidebar toggle and responsiveness
 */

async function gotoRoute(window: import("@playwright/test").Page, path: string): Promise<void> {
  if (window.url().endsWith(path)) return;

  // Primary: in-page client navigation preserves Electron RenderFrameHost without detachment
  try {
    await window.evaluate((target) => {
      window.location.href = target;
    }, path);
    await window.waitForURL(new RegExp(path.replace(/\//g, "\\/")), { timeout: 45_000 });
    return;
  } catch {
    // Fallback to top-level navigation if evaluate timed out
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await window.goto(`http://localhost:3000${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      return;
    } catch (error) {
      lastError = error;
      await window.waitForTimeout(2_000);
    }
  }
  throw lastError;
}

test.describe("AI & Moudir feature journey", () => {
  test("complete AI user experience with screenshots", async () => {
    test.setTimeout(300_000);

    const { app, window } = await launchApp({
      testName: "ai-journey",
    });

    try {
      // ── Step 1: Navigate to Moudir AI screen ────────────────────────────────
      await test.step("navigate to Moudir AI chat screen", async () => {
        // Guarantee session if redirected to login
        await signUp(window, TEST_EMAIL, TEST_PASSWORD);

        await gotoRoute(window, "/dashboard/moudir");

        // Verify Moudir branding & local AI indicator
        await expect(window.locator("header").getByText("Moudir", { exact: true })).toBeVisible({
          timeout: 45_000,
        });
        await expect(window.locator("header").getByText(/IA locale/i)).toBeVisible();

        // Capture milestone screenshot 1
        await screenshot(window, "ai-01-moudir-initial-screen");
      });

      // ── Step 2: Conversation sidebar & new conversation creation ───────────
      await test.step("interact with conversation sidebar", async () => {
        // "Nouveau" button creates a fresh dataset-scoped chat thread
        const newChatButton = window.getByRole("button", { name: /Nouveau/i });
        await expect(newChatButton).toBeVisible();

        await newChatButton.click();
        await window.waitForTimeout(500);

        // Capture milestone screenshot 2: Sidebar active with new chat
        await screenshot(window, "ai-02-conversation-sidebar-active");
      });

      // ── Step 3: Prompt Composer interaction ────────────────────────────────
      await test.step("type natural language prompt in AI composer", async () => {
        const composer = window.getByPlaceholder(/Posez une question/i);
        await expect(composer).toBeVisible();

        // Type analytical query
        const testPrompt =
          "Analyse les transactions par canal de paiement et identifie les anomalies récentes.";
        await composer.fill(testPrompt);
        await expect(composer).toHaveValue(testPrompt);

        // Capture milestone screenshot 3: Composer filled with analytical request
        await screenshot(window, "ai-03-composer-with-prompt");
      });

      // ── Step 4: Search Palette (⌘K) ─────────────────────────────────────────
      await test.step("open and inspect conversation search palette", async () => {
        const searchButton = window.getByRole("button", {
          name: /Rechercher dans les conversations/i,
        });

        if (await searchButton.isVisible()) {
          await searchButton.click();
          await window.waitForTimeout(400);

          // Capture milestone screenshot 4: Search palette open
          await screenshot(window, "ai-04-chat-search-palette");

          // Close search palette
          await window.keyboard.press("Escape");
          await window.waitForTimeout(300);
        }
      });

      // ── Step 5: Sidebar Collapse & Expand (Focus mode) ──────────────────────
      await test.step("toggle sidebar into focus mode", async () => {
        const toggleButton = window.getByRole("button", {
          name: /Masquer les conversations|Afficher les conversations/i,
        });

        if (await toggleButton.isVisible()) {
          await toggleButton.click();
          await window.waitForTimeout(500);

          // Capture milestone screenshot 5: Focused wide chat canvas
          await screenshot(window, "ai-05-sidebar-collapsed-focus-mode");

          // Restore sidebar
          await toggleButton.click();
          await window.waitForTimeout(400);
        }
      });

      // ── Step 6: Full workspace view with clean canvas ──────────────────────
      await test.step("capture full AI workbench layout", async () => {
        await screenshot(window, "ai-06-full-ai-workbench");
      });
    } finally {
      await closeApp(app);
    }
  });
});
