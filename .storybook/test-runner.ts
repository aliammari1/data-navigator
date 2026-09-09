import AxeBuilder from "@axe-core/playwright";
import type { TestRunnerConfig } from "@storybook/test-runner";
import { getStoryContext } from "@storybook/test-runner";

/**
 * Storybook test-runner configuration.
 *
 * Every story becomes a smoke + interaction test (the `play` function runs and
 * any assertions in it are validated). On top of that we run axe-core
 * accessibility checks against each rendered story, honouring per-story a11y
 * parameters so individual stories can disable specific rules when a violation
 * is intentional / a known third-party limitation.
 *
 * Run with: `pnpm run test-storybook` (against a running Storybook) or
 * `pnpm run test-storybook:ci` (builds + serves + tests in one shot).
 */
const config: TestRunnerConfig = {
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);

    // Allow a story to opt out entirely: parameters.a11y.disable = true
    if (storyContext.parameters?.a11y?.disable) {
      return;
    }

    // Wait for the story root to be present before auditing.
    await page.waitForSelector("#storybook-root", { state: "attached" });

    const builder = new AxeBuilder({ page })
      .include("#storybook-root")
      // WCAG 2.1 AA is the bar for this product.
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

    // Respect per-story rule overrides:
    // parameters.a11y.config.rules = [{ id: "color-contrast", enabled: false }]
    const ruleOverrides = storyContext.parameters?.a11y?.config?.rules;
    if (Array.isArray(ruleOverrides)) {
      const disabled = ruleOverrides
        .filter((r: { id?: string; enabled?: boolean }) => r?.enabled === false && r.id)
        .map((r: { id: string }) => r.id);
      if (disabled.length > 0) {
        builder.disableRules(disabled);
      }
    }

    const results = await builder.analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map(
          (v) =>
            `  • [${v.impact ?? "n/a"}] ${v.id}: ${v.help} (${v.nodes.length} node${
              v.nodes.length === 1 ? "" : "s"
            })`,
        )
        .join("\n");
      throw new Error(
        `Accessibility violations in story "${context.title} / ${context.name}":\n${summary}\n` +
          `See ${results.violations[0]?.helpUrl ?? "https://dequeuniversity.com/rules/axe/"}`,
      );
    }
  },
};

export default config;
