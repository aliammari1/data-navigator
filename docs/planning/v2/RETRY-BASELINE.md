# V2 Retry — Baseline (2026-06-12)

Decision: **keep & fix in place** the staged v2 attempt (707 files, +142k/−93k), targeting
**all 27 features / 3 phases, batched** across sessions. Prior attempt preserved on
`backup/v2-attempt-snapshot` (commit 048ac38). Coordination swarm: `swarm-1781273487145-1di2cr`.

## Gate baseline (at start)

| Gate | Result | Notes |
|---|---|---|
| `tsc --noEmit` | ✅ green | |
| `next build` (TS check) | ❌ 1 error → **FIXED** | `ExcelJS.CellValue` namespace used on a runtime const in `DataBrowserScreen.tsx:940`; fixed via `import("exceljs").CellValue` |
| `biome lint` | ❌ 192 errors → 127 after safe auto-fix | see below |
| `vitest run` | ⚠️ 90/91 pass | failures are vitest worker-fork **timeouts** (WSL2 + /mnt/d slowness, env setup ~370s), not logic |
| `node_modules` | ✅ linux x64, esbuild loads | env healthy (reinstalled from Linux) |

## Lint errors after safe auto-fix (127, biome ERROR-level only; 226 warnings are non-blocking)

By rule:
- `correctness/useExhaustiveDependencies` — 51 (judgment; many had `eslint-disable`; fix without introducing render loops)
- `a11y/useButtonType` — 32 (add `type="button"`)
- `a11y/noStaticElementInteractions` — 14
- `a11y/useKeyWithClickEvents` — 10
- `suspicious/useIterableCallbackReturn` — 6 (real: callback must return)
- `suspicious/noShadowRestrictedNames` — 4
- `suspicious/noAssignInExpressions` — 4
- `a11y/noAutofocus` — 2, `suspicious/noImplicitAnyLet` — 2
- `a11y/useAriaPropsForRole` — 1, `a11y/noRedundantRoles` — 1

54 files affected; biggest: DataBrowserScreen (14), ux-innovations/AchievementSystem (12),
channel-monitor screen (11), agent-canvas/AgentFlowGraph (6), report-studio screen (6),
data-formulator/mcp-client (5), analytics-theater (5).

`noNonNullAssertion` (160) is **warning-level** — not blocking; deferred.

## Plan (durable tasks #1–#6)

- A: fix to green (build ✅ done; lint in progress via parallel agents) — task #2
- B: wire & verify 10 new features functional — task #3
- C/D/E: roadmap phases 1/2/3 — tasks #4/#5/#6

## Known env caveat
Tests + tsc are very slow on `/mnt/d` (WSL2 → Windows FS). Vitest fork timeouts are infra,
not code. Consider `pool: 'threads'` or raising `testTimeout`/`poolOptions` for CI on WSL.
