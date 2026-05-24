<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Data Navigator — Agent Guide

## Package Manager
**Use Bun** for all commands. This project uses bun, not npm/yarn/pnpm.

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run Next.js dev server |
| `npm run build` | Build Next.js for production |
| `npm run lint` | Run Biome linter |
| `npm run format` | Format code with Biome |
| `npm run build:worker` | Build all web workers (DuckDB, Python, LLM) |
| `npm run electron:dev` | Run Electron with Next.js dev |
| `npm run electron:build` | Build Electron app package |

## Dev Workflow

1. Always run `npm run build:worker` before `npm run dev` if workers were modified
2. For Electron: `npm run electron:dev` runs both Next.js + Electron
3. Lint before committing: `npm run lint` (fix with `npm run format`)

## Project Structure

- `src/app/` — Next.js App Router pages (dashboard/*, login/*, telecom-report/*)
- `src/components/` — React components (ui/* = shadcn components)
- `electron/` — Electron main + preload (TypeScript, built to build/)
- `public/workers/` — Built web workers (DuckDB, Python sandbox, LLM)
- `scripts/` — Build/util scripts (check-architecture, lan-server, prepare-standalone)

## Known Issues to Avoid

1. Biome config version mismatch — schema says 2.2.0 but CLI is 2.4.15. Run `biome migrate` or ignore.
2. Workers are built files — don't edit directly, modify `src/workers/` and rebuild
3. Electron files are built — edit `electron/*.ts`, not `build/`
4. Hardcoded language in `src/app/layout.tsx:33` — currently `lang="fr"`

## Framework Quirks

- Next.js 16 + React 19 — check `node_modules/next/dist/docs/` for breaking changes
- TailwindCSS 4 — config in CSS, not tailwind.config.js
- State management via Zustand (not Redux/Context)
- Charts: Recharts, D3.js, Nivo, ECharts available
- Data: DuckDB WASM, PapaParse, Arquero for in-browser processing

## Electron Notes

- Main process: `electron/main.ts` → `build/main.js`
- Preload: `electron/preload.ts` → `build/preload.js`
- Uses Squirrel for Windows installers
- Standalone Next.js server runs on port 3001 in Electron

## Lint/Typecheck

- TypeScript: `npx tsc --noEmit` (no errors currently)
- Linter: Biome (`npm run lint`)
- No `@ts-ignore` workarounds in codebase
