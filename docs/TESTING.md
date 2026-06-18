# Testing & Storybook conventions

This project treats tests and Storybook as one quality system. Stories are not
just documentation — through the Storybook test-runner they double as render,
interaction, and accessibility tests. This document is the contract for both.

## The testing pyramid we run

| Layer | Tool | Location | Runs in CI |
| --- | --- | --- | --- |
| Unit / logic | Vitest (jsdom) | `tests/**/*.test.ts(x)` | `pnpm test` |
| Component render + a11y | Vitest + Testing Library + `vitest-axe` | `tests/**/*.test.tsx` | `pnpm test` |
| Security (Electron trust boundary) | Vitest | `tests/security/**` | `pnpm test` |
| Interaction + a11y (per story) | Storybook test-runner + `@axe-core/playwright` | `*.stories.tsx` `play` | `pnpm test:storybook:ci` |
| Visual regression | Playwright snapshots of built Storybook | `tests/visual/**` | `pnpm test:vr` |
| Performance | Vitest `bench` (tinybench) | `tests/performance/**/*.bench.ts` | `pnpm bench` |
| End-to-end journeys | Playwright | `tests/e2e/**` | `pnpm test:e2e` |
| Dependency / supply chain | `pnpm audit`, `knip` | — | Security workflow |
| Static security analysis | CodeQL | — | Security workflow |

## Commands

```bash
pnpm test                 # unit + component + security (Vitest)
pnpm test:coverage        # same, with V8 coverage + threshold gates
pnpm bench                # performance benchmarks
pnpm test:storybook       # interaction + a11y, against a running Storybook
pnpm test:storybook:ci    # build-free: serves storybook-static then tests it
pnpm test:vr              # visual regression vs committed baselines
pnpm test:vr:update       # refresh visual baselines (after intended changes)
pnpm test:e2e             # Playwright user journeys
pnpm check:stories        # story quality gate (errors fail, stubs warn)
pnpm check:stories:strict # story quality gate (stubs also fail)
```

## Coverage policy

We use the V8 provider. Rather than one global threshold — which would be
permanently red against a large, gradually covered codebase — we gate
**critical modules hard** and ratchet the gated set outward as coverage grows.
The current hard gates live in `vitest.config.ts` (`test.coverage.thresholds`)
and include the Electron security boundary (`electron/security.ts`, 95% lines /
100% functions) and shared formatting/ingest helpers. When you add meaningful
tests for a module, add it to the threshold map so the coverage can't regress.

## Writing a unit test

Pure functions get table-style assertions. Keep them deterministic — no real
timers, network, or filesystem. Use the shared `render` from
`tests/test-utils.tsx` for components (it wires React Query + Radix providers),
and `vitest-axe` for accessibility:

```ts
import { axe } from "vitest-axe";
import { render } from "../../test-utils";

it("has no a11y violations", async () => {
  const { container } = render(<MyComponent />);
  expect(await axe(container)).toHaveNoViolations();
});
```

## Writing a story (the contract)

Every `*.stories.tsx` MUST:

1. Import the **real** exported component symbol. The audit
   (`pnpm check:stories`) fails when the imported name is not an actual export —
   this catches stories that silently render `undefined`.
2. Set realistic `args` on the meta (no bare `export const Default: Story = {}`).
3. Provide named variants covering the meaningful prop space (states, sizes,
   empty/loading/error where applicable).
4. Add a `play` interaction test for anything interactive (clicks, inputs,
   toggles), asserting behavior with `expect`/`fn` from `storybook/test`.
5. Pass accessibility checks (the global a11y addon runs on every story; relax a
   specific rule only with a justified `parameters.a11y.config.rules` override).

The canonical reference is
[`src/features/telecom/components/kpi-card.stories.tsx`](../src/features/telecom/components/kpi-card.stories.tsx).

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn, userEvent, within } from "storybook/test";
import { Widget } from "./widget";

const meta = {
  title: "Src/Features/.../Widget",
  component: Widget,
  tags: ["autodocs"],
  args: { /* realistic defaults */ onAction: fn() },
} satisfies Meta<typeof Widget>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ActsOnClick: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await expect(args.onAction).toHaveBeenCalled();
  },
};
```

Opting out of a check (use sparingly, with a comment explaining why):

- Skip the visual snapshot: add `"no-visual-test"` to the story's `tags`.
- Disable a11y for a story: `parameters: { a11y: { disable: true } }`.

## Security testing

`electron/security.ts` is the renderer→main trust boundary (path allowlisting,
origin checks, IPC payload validation). It is pure and exhaustively tested in
`tests/security/`. Any new IPC surface in `electron/main.ts` must route through
this module and gain matching tests before merge.
