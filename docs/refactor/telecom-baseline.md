# Telecom Refactor Baseline

Date: 2026-05-08
Commit: `94ff531`

## Scope

This baseline starts the telecom simplification program from `TELECOM_SIMPLIFICATION_PLAN.md`.

## Tooling

- Existing scripts: `bun run lint`, `bun run build`
- No test script is currently declared in `package.json`.
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files were found under `src`.

## First Slice

The first implementation slice is limited to pure telecom domain extraction:

- centralize status definitions
- centralize telecom dataset helpers
- rewire core SQL/query modules to the shared status definitions
- preserve existing exports for compatibility

## Source Notes

- Pure TypeScript shared-helper extraction does not require framework-specific source citations.
- Future React hook extraction should follow React custom hook guidance:
  <https://react.dev/learn/reusing-logic-with-custom-hooks>
- Future Next client-boundary changes should follow:
  <https://nextjs.org/docs/app/api-reference/directives/use-client>
