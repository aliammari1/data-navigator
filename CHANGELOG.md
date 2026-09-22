## 1.0.5

### Patch Changes

- Fix packaged AppImage startup when the Next.js auth database looks for Drizzle migrations from the launch directory instead of the bundled `app.asar/drizzle` directory.
- Use electron-builder's static AppImage runtime so modern Arch/Omarchy systems can launch without installing legacy FUSE2.

# data-navigator

## 1.0.4

### Patch Changes

- Avoid a spurious legacy settings migration exception on clean packaged installs by checking for the legacy table before reading it. This keeps fresh-start boot logs clean while preserving the one-time migration for existing users.

## 1.0.3

### Patch Changes

- Resolve Coraza WASM explicitly via `wasmSource` buffer in `src/proxy.ts` and set `CORAZA_WASM_PATH` in `electron/main.ts`. Bypasses `@coraza/core`'s cwd-dependent module resolution in packaged desktop (ASAR) environments where `process.cwd()` points to the host launch directory (e.g. `~/Downloads`).

## 1.0.2

### Patch Changes

- Bundle `@coraza/next` into the Next.js server build instead of externalizing it. Resolves runtime `Cannot find module 'next/server'` when running in packaged desktop app, while keeping `@coraza/core` and `@coraza/coreruleset` external so WASM and rules files remain accessible.

## 1.0.1

### Patch Changes

- cff624a, d0cdf75: Fix Coraza WAF runtime resolution in packaged desktop app (#29).
  - Keep `@coraza/core`, `@coraza/coreruleset`, and `@coraza/next` external in Next.js standalone build.
  - Explicitly stage Coraza runtime packages into the packaged desktop app.
  - Fail desktop packaging if required Coraza package manifests are missing.

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

