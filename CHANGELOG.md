# data-navigator

## 1.0.0

### Major Changes

- 0632526: Promote Data Navigator to the final v1.0.0 PFE defense baseline, consolidating the validated offline-first application, release hardening, security fixes, and Windows/Linux packaging into the single defense release.

## 0.1.3

### Patch Changes

- Release Data Navigator:
  - Add Linux release packaging workflow and automated GPG package signing (.AppImage, .deb, and .asc).
  - Support local Windows and Linux code signing with native osslsigncode and local certificates.
  - Fix changesets private package publication bridge to ensure GitHub Releases and tags are properly created.
  - Enhance collaboration hub, live cursors, LAN peer management, and guest secret routes.
  - Update folders organization with date organizer and refined desktop shell inspection.
  - Enforce strict air-gap compliance, offline-first execution, and zero unauthorized telemetry.

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

