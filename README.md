<div align="center">

# Data Navigator

**Local-first, AI-powered data analytics and visualization desktop application.**  
Engineered for privacy, zero-cloud dependency, and high-performance tabular computation.

[![Node Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm Version](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](https://pnpm.io/)
[![Electron](https://img.shields.io/badge/Electron-43.0.0-47848F.svg)](https://www.electronjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.10-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.7-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red.svg)](#)

[Getting Started](#-getting-started) • [Architecture](#-architecture--tech-stack) • [Development](#-developer-quickstart) • [Quality & Testing](#-testing--quality-gates)

</div>

---

## 📖 Overview

**Data Navigator** is a modern desktop platform that combines high-performance analytical compute engines, offline local large language models (LLMs), sandboxed code execution, and LAN-first real-time collaboration. It empowers analysts and teams to transform, explore, analyze, and visualize complex datasets entirely on their local hardware—with zero cloud telemetry, zero remote data leaks, and uncompromising privacy.

---

## 🚀 Key Capabilities

### ⚡ Local-First Analytical Compute
- **Dual Vector Engines**: Execute ultra-fast analytical queries over millions of rows using in-process **DuckDB** (`@duckdb/node-api`) and **Polars** (`nodejs-polars`).
- **Zero-Copy Streaming**: Process tabular formats via **Apache Arrow**, **Arquero**, and **Flechette** with minimal memory overhead.
- **Encrypted Local Storage**: Project schemas and chat records persisted in **SQLite** via `better-sqlite3-multiple-ciphers` with SQLCipher AES-256 encryption and schema safety backed by **Drizzle ORM**.

### 🤖 Offline Local AI & Code Sandbox
- **Native GGUF Inference**: On-device text generation powered by `node-llama-cpp` running localized models (such as IBM Granite 3b) directly inside the Electron main process.
- **Sandboxed Python Runtime**: Client-side Python execution via a sandboxed **Pyodide** WebWorker isolated under a custom `pyodide://` security protocol.
- **Schema-Guaranteed Outputs**: Grammar-constrained structured outputs validated with **Zod** schemas.

### 👥 LAN-First Real-Time Collaboration
- **Zero-Cloud Pairing**: Collaborate securely over the local network with no internet connection or external servers required.
- **CRDT Synchronization**: Conflict-free document state syncing driven by **Yjs** and **Hocuspocus** WebSocket server.
- **Zero-Config Discovery**: Automatic peer and host discovery over local Wi-Fi / Ethernet using mDNS and **Bonjour** services (`bonjour-service`).
- **Cryptographic Role Derivation**: Dynamic Host, Editor, and Viewer permission levels determined by access codes.

### 📊 Modern Visualization & Canvas
- **High-Fidelity Charts**: Interactive visual exploration powered by **ECharts**, **Recharts**, and ultra-fast canvas charts via **uPlot**.
- **Visual Node Workflows**: Node-based transformation pipelines and data lineage graphs built on **XYFlow** (`@xyflow/react`).
- **Polished Interface**: Built with **Tailwind CSS 4**, **Shadcn/UI**, **Radix UI**, and Lucide icons.

---

## 🛠️ Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON 43 RUNTIME                             │
├───────────────────────────────────┬────────────────────────────────────┤
│         MAIN PROCESS              │         RENDERER PROCESS           │
│  • Node 24+ Native Layer          │  • Next.js 16 (App Router /        │
│  • IPC Trust Boundary             │    Standalone output)              │
│  • node-llama-cpp (GGUF Models)   │  • React 19 + TypeScript 6         │
│  • DuckDB & Polars Engine         │  • Tailwind CSS 4 + Shadcn/UI      │
│  • SQLite / SQLCipher (Drizzle)   │  • ECharts / Recharts / uPlot      │
│  • Hocuspocus CRDT Server         │  • XYFlow Lineage Canvas           │
│  • Bonjour mDNS Discovery         │  • Yjs Client / y-indexeddb        │
│  • Pyodide Protocol Handler       │  • Pyodide WebWorker Sandbox       │
└───────────────────────────────────┴────────────────────────────────────┘
```

| Domain | Technologies & Libraries |
| --- | --- |
| **Core Desktop & Web** | Electron 43, Next.js 16 (Standalone App Router), React 19, TypeScript 6 |
| **Data & Query Engines** | DuckDB (`@duckdb/node-api`), Polars (`nodejs-polars`), Apache Arrow, Arquero, Flechette |
| **Database & Encryption** | SQLite (`better-sqlite3-multiple-ciphers` with SQLCipher AES-256), Drizzle ORM |
| **Local AI & Code Sandbox** | `node-llama-cpp` (Granite 3b GGUF), Moudir AI, Pyodide (WASM Python sandbox), Zod |
| **Collaboration & Sync** | Yjs, Hocuspocus (`@hocuspocus/server` & `@hocuspocus/provider`), Bonjour Service |
| **UI & Visualizations** | Tailwind CSS 4, Shadcn/UI, Radix UI, ECharts, Recharts, uPlot, XYFlow |
| **Testing & Verification** | Vitest, Playwright (E2E & Electron), Stryker (Mutations), Storybook Test Runner |
| **Tooling & Code Quality** | Biome (lint & format), Knip (dead code), Dependency Cruiser, Lefthook, Changesets |

---

## 🎯 Getting Started

### Prerequisites

- **Node.js**: `>=24.0.0`
- **Package Manager**: Strictly `pnpm@11.9.0`

> [!IMPORTANT]
> This repository strictly enforces `pnpm@11.9.0`. Do not use `npm` or `yarn` as they bypass the lockfile integrity and native rebuild configurations.

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/aliammari1/data-navigator.git
cd data-navigator

# Install dependencies using pnpm
pnpm install
```

### Running Development

Launch the complete local development environment (Worker bundle build + Next.js App Router server + Electron watcher):

```bash
pnpm dev
```

This concurrently orchestrates:
1. `pnpm run worker:build` – Bundles WebWorkers (Pyodide, inference) via esbuild.
2. `pnpm run next:dev` – Boots Next.js on `http://0.0.0.0:3000`.
3. `pnpm run electron:dev` – Watches and builds Electron TypeScript entrypoints with `tsup` and starts Electron with remote debugging enabled.

---

## 💻 Developer Command Reference

### Development & Build

| Command | Description |
| --- | --- |
| `pnpm dev` | Starts full development workflow (Workers + Next.js + Electron) |
| `pnpm run build` | Compiles workers and generates Next.js production build |
| `pnpm run desktop:build` | Builds production Next.js standalone bundle + workers + Electron main process |
| `pnpm run worker:build` | Builds standalone WebWorker bundles with esbuild |
| `pnpm run storybook` | Starts Storybook component explorer on `http://localhost:6006` |
| `pnpm run lan-server` | Launches standalone Hocuspocus/LAN collaboration relay server |

### Packaging & Distribution (Electron Builder)

| Command | Description |
| --- | --- |
| `pnpm run dist:linux:dir` | Packages unpacked 64-bit Linux distribution into `dist/linux-unpacked` |
| `pnpm run dist:linux` | Builds Linux production packages (AppImage, deb) |
| `pnpm run dist:win:dir` | Packages unpacked 64-bit Windows distribution |
| `pnpm run dist:win` | Builds Windows production installers (MSI, NSIS) |
| `pnpm run dist` | Full desktop build and packages target distribution via electron-builder |

### Database & Models

| Command | Description |
| --- | --- |
| `pnpm run drizzle:generate` | Generates Drizzle migrations for main database schemas |
| `pnpm run drizzle:generate:chat` | Generates migrations for Moudir SQLite chat store |
| `pnpm run prepare:models` | Prepares and validates local GGUF model assets |
| `pnpm run models:hash` | Verifies SHA-256 hashes of packaged GGUF weights |

---

## ✅ Testing & Quality Gates

Data Navigator enforces a rigorous multi-tier testing and verification pyramid:

```bash
# Run standard unit, component, and security tests (Vitest)
pnpm test

# Run Vitest with V8 coverage thresholds
pnpm run test:coverage

# Run Playwright browser end-to-end journeys
pnpm run test:e2e

# Run Playwright full Electron desktop journey tests
pnpm run test:e2e:electron

# Run Stryker mutation testing suite
pnpm run test:mutation

# Run AI prompt & model safety evaluations
pnpm run test:eval

# Run performance benchmarks (DuckDB, tinybench)
pnpm run bench
```

### Static Analysis, Linting & Architecture Gates

```bash
# Run comprehensive quality check suite (deps, biome, tsc, architecture, knip)
pnpm run check

# Run Biome linter and formatter checks
pnpm run lint
pnpm run format:check

# Run TypeScript typechecker
pnpm run typecheck

# Validate architectural boundaries with Dependency Cruiser
pnpm run check:deps

# Detect unused dependencies and dead code with Knip
pnpm run check:deadcode
```

---

## 🔒 Security & Sandboxing

- **Process Isolation**: Electron renderer process runs with `contextIsolation: true` and `nodeIntegration: false`. All privileged OS capabilities are guarded behind sanitized IPC channels with `withTrustedSender` validation.
- **Python Execution Sandbox**: Pyodide runs in an isolated worker under an opaque origin using custom `pyodide://` URI scheme handlers with strict Content Security Policy (CSP).
- **At-Rest Encryption**: User datasets and session histories are encrypted locally using SQLCipher (`better-sqlite3-multiple-ciphers`).
- **LAN Perimeter**: Real-time collaboration uses ephemeral LAN-only pairing tokens with zero external cloud connectivity.

---

## 🦋 Versioning & Releases

Data Navigator uses [Changesets](https://github.com/changesets/changesets) to manage release versions and maintain an accurate `CHANGELOG.md`:

```bash
# Generate a new changeset entry
pnpm changeset

# Inspect changeset status
pnpm run changeset:status

# Bump application version and update lockfile
pnpm run version:app

# Publish release assets
pnpm run release
```

---

This project is private and proprietary.

