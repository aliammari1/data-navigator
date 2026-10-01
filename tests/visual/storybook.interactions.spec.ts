import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type Story = { id: string; title: string; name: string; type: string };
type A11yRule = { id?: string; enabled?: boolean };

// Discovery happens after storybook:build, so a missing or empty index blocks CI.
const index = JSON.parse(readFileSync("storybook-static/index.json", "utf8")) as {
  entries: Record<string, Story>;
};
const stories = Object.values(index.entries).filter((entry) => entry.type === "story");

test("built Storybook contains stories", () => {
  expect(stories.length).toBeGreaterThan(0);
});

for (const story of stories) {
  test(`${story.title} / ${story.name}`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto(`/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`);

    // Storybook runs play() as part of its render lifecycle. The root can be
    // attached before play() finishes, so wait for the completed render phase.
    const render = await page.waitForFunction((storyId) => {
      const preview = (
        window as typeof window & {
          __STORYBOOK_PREVIEW__?: {
            currentRender?: {
              id: string;
              phase: string;
              story?: {
                parameters?: { a11y?: { disable?: boolean; config?: { rules?: A11yRule[] } } };
              };
            };
          };
        }
      ).__STORYBOOK_PREVIEW__;
      const current = preview?.currentRender;
      return current?.id === storyId && ["finished", "errored"].includes(current.phase)
        ? { phase: current.phase, a11y: current.story?.parameters?.a11y }
        : false;
    }, story.id);

    const result = await render.jsonValue();
    expect(result.phase, `Storybook render/play failed for ${story.id}`).toBe("finished");
    expect(browserErrors, `browser errors in ${story.id}`).toEqual([]);
    await expect(page.locator("#storybook-root")).toBeAttached();

    if (result.a11y?.disable) return;

    const axe = new AxeBuilder({ page })
      .include("#storybook-root")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    const disabledRules = result.a11y?.config?.rules?.flatMap((rule) =>
      rule.id && rule.enabled === false ? [rule.id] : [],
    );
    if (disabledRules?.length) axe.disableRules(disabledRules);

    const audit = await axe.analyze();
    expect(
      audit.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target),
      })),
      `WCAG 2.1 AA violations in ${story.id}`,
    ).toEqual([]);
  });
}
