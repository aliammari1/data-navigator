# data-navigator

## 0.1.2

### Patch Changes

- 550875f: Harden push/CI gates without behavior changes: scope the Vitest workspace so
  `pnpm test` runs the unit suite only (evals and native-DuckDB benches keep
  their own entry points), close 18 dependency-cruiser errors (type-only `ai`
  carve-out, dev-gated React Query devtools island, main-only storage
  exemptions, declared `msw-storybook-addon`/`alasql`/`@stryker-mutator/api`
  devDependencies, dropped stale `electron/types.d.ts`), remove dead code
  flagged by knip (unused UI/ai-elements scaffold, unreferenced exports, duplicate
  `acquireRoom`/`BUILTIN_STATUS_CODES` aliases), migrate Storybook preview to
  `msw-storybook-addon` v3, swap unmaintained `image-size` for patched
  `image-size-next` via pnpm override (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr),
  and align the structured-output eval schema with the canonical `ChartType`
  union.

## 0.1.1

### Patch Changes

- b100904: First release
- 296a7d2: First Release

## 1.0.0

### Major Changes

- c82fc0c: Add a documented, automated release workflow with application versioning, changelogs, Git tags, and GitHub Releases.

### Patch Changes

- b592bfb: Add a documented, automated release workflow with application versioning, changelogs, Git tags, and GitHub Releases.
