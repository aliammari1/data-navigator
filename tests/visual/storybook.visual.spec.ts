import { expect, test } from "@playwright/test";

/**
 * Visual-regression sweep over every Storybook story.
 *
 * The built Storybook exposes a machine-readable index at `/index.json`. We
 * read it, enumerate every `story`-type entry, render each one in isolation via
 * `iframe.html?id=<storyId>`, and diff a full-page screenshot against the
 * committed baseline.
 *
 * Stories can opt out by setting `parameters.chromatic.disableSnapshot = true`
 * or `parameters.visual = { skip: true }` in the story file.
 */

type StoryIndexEntry = {
  id: string;
  title: string;
  name: string;
  type: "story" | "docs";
  tags?: string[];
};

type StoryIndex = {
  v: number;
  entries: Record<string, StoryIndexEntry>;
};

const SKIP_TAG = "no-visual-test";

test.describe("Storybook visual regression", () => {
  let entries: StoryIndexEntry[] = [];

  test.beforeAll(async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/index.json`);
    expect(
      res.ok(),
      "storybook index.json should be reachable — did you run build:storybook?",
    ).toBeTruthy();
    const index = (await res.json()) as StoryIndex;
    entries = Object.values(index.entries).filter(
      (e) => e.type === "story" && !(e.tags ?? []).includes(SKIP_TAG),
    );
    expect(entries.length, "expected at least one story in the index").toBeGreaterThan(0);
  });

  test("snapshot every story", async ({ page, baseURL }) => {
    test.slow(); // many stories — give it room.

    // Re-read the index inside the test body so we have the list per worker.
    const res = await page.request.get(`${baseURL}/index.json`);
    const index = (await res.json()) as StoryIndex;
    const list = Object.values(index.entries).filter(
      (e) => e.type === "story" && !(e.tags ?? []).includes(SKIP_TAG),
    );

    for (const story of list) {
      await test.step(`${story.title} / ${story.name}`, async () => {
        await page.goto(`${baseURL}/iframe.html?id=${story.id}&viewMode=story`, {
          waitUntil: "networkidle",
        });
        await page.waitForSelector("#storybook-root", { state: "visible" });
        // Settle entrance animations (motion/react) before snapshotting.
        await page.waitForTimeout(400);

        await expect(page).toHaveScreenshot(`${story.id}.png`, {
          fullPage: true,
        });
      });
    }
  });
});
