All ground-truth claims confirmed against HEAD:
- `assertReadOnlySql` (duckdb-service.ts:541) — prefix-allowlist + keyword-regex over raw SQL; `read_csv('/etc/passwd')` inside a `SELECT` passes both gates.
- DuckDB instance (`:668`) opens writable with no `access_mode`/`enable_external_access`/`lock_configuration`; `memory_limit='4GB'` (`:686`) confirmed; no per-channel/llama/voice caps.
- Trusted-origin wildcard already dropped (main.ts:906-908) → DONE.
- `middleware.ts` exists with Host + Sec-Fetch, no token, self-flagged minimalMode risk → PARTIAL.
- `blockExoticSubdeps: true` (pnpm-workspace.yaml:1) → DONE.

Producing the final blueprint now.

# Target Security Architecture Blueprint — data-navigator

Offline-first Electron 41 + Next.js 16 (`output: standalone`) desktop app, loopback-bound `127.0.0.1:3000`, Windows primary. This is the **architecture-level target** — process/trust topology, capability design, encryption-at-rest, and integrity chains, with a sequenced, migration-aware adoption path. It supersedes a flat checklist; `docs/security/localhost-hardening-catalog.md` remains the implementation backlog.

**Root-cause framing (one sentence):** the `BETTER_AUTH_SECRET` holder and every hostile-input native parser (DuckDB CSV/Parquet, llama.cpp GGUF, sherpa/onnxruntime audio+ONNX) are the **same OS process today**, so a single heap overflow in any parser — cf. the real Electron `NativeImage::CreateFromPath` heap overflow [GHSA-6r2x-8pq8-9489](https://github.com/electron/electron/security/advisories/GHSA-6r2x-8pq8-9489) (CWE-122) — is RCE next to the auth secret with the filesystem allowlist pre-granted.

---

## 1. Trust Topology (diagram-in-prose)

### Today (single trust domain)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  MAIN (Node, privileged) ── ONE address space, ONE trust zone             │
│   SECRET HOLDER:  BETTER_AUTH_SECRET (plaintext file), PathAccessControl, │
│                   fuses, nav/window guards, IPC allowlist                  │
│   HOSTILE-INPUT PARSERS in the SAME memory:                               │
│     • @duckdb/node-api    read_csv / read_parquet  (user files)           │
│     • node-llama-cpp      loadModel() mmaps downloaded GGUF               │
│     • sherpa-onnx-node    .onnx + arbitrary audio Float32Array            │
│   EGRESS in the SAME memory:                                              │
│     • fetch(huggingface.co)   (model-download-service.ts)                 │
│     • @hocuspocus/server + bonjour mDNS bound to LAN NICs                 │
└───────────────▲────────────────────────────────────────────────────────┬─┘
                │ ipcMain.handle (~40 channels, withTrustedSender)         │
                │ MessagePort data path runs THROUGH this secret holder    │
┌───────────────┴──────────────────────────────────────────────────────────┐
│  RENDERER (Chromium, untrusted) — sandbox:true + contextIsolation [DONE]  │
│   renders attacker CSV cells + LLM/markdown; ~35 ESM/blob workers;        │
│   DuckDB-WASM; holds NO secret, NO ambient FS authority                   │
└──────────────────────────────────────────────────────────────────────────┘

  Zone 3 (loopback HTTP): Next standalone on 127.0.0.1:3000 — reachable by any
   local process AND any browser tab the user has open.
```

### Target (4-tier topology — privilege strictly decreases outward)

```
ZONE 1  BROKER = MAIN, parses NOTHING attacker-controlled
        owns ONLY: BETTER_AUTH_SECRET custody, safeStorage KEK,
        PathAccessController, fuses, nav/window guards,
        the IPC channel registry, capability-port grants, lifecycle.
            │ grants unforgeable MessagePorts (capability handles)
            │ never sits on the megabyte/page data path
    ┌───────┼─────────────┬──────────────┬───────────────────────────┐
    ▼       ▼             ▼              ▼                           ▼
ZONE 0   ZONE 2a       ZONE 2b        ZONE 2c                    ZONE 3
RENDERER duckdb-worker llama-worker   voice-worker               EDGE worker
(untrust)(utilityProc) (utilityProc)  (utilityProc)              (utilityProc)
sandbox  read-only     GGUF mmap      .onnx + audio              ALL network I/O:
+ CSP    DuckDB instc  no secret      no secret                  HF fetch + Hocuspocus
no secret no secret    own session    own session                + bonjour; no secret,
+ min.   per-channel   per-channel    per-channel                FS = model/collab dirs
  WASM   DoS bounds    DoS bounds     DoS bounds                 only; per-channel bounds
  imports

DATA FLOW after handshake:
  renderer ──direct MessagePort──► duckdb/llama/voice workers   (broker NOT in path)
  workers  ──MessagePort──► broker  ONLY for vetted FS paths / lifecycle / progress
  edge worker ──the ONLY sockets in the whole app──► internet + LAN

SECRETS LIVE: BETTER_AUTH_SECRET + safeStorage-wrapped DEK in BROKER ONLY.
  Invariant: compromise of an OUTER zone must not yield an INNER zone's authority.
   renderer-XSS → only the 3 capability ports (query/generate/voice), no FS/SQL
   native-RCE   → contained to a worker with no secret, no FS allowlist
   HTTP hijack  → rejected by host-allowlist + (target) capability token
   LAN/HF compromise → contained to the edge worker, one boundary from the secret
```

**Why `utilityProcess` and not `child_process.fork`:** `RunAsNode:false` is already fused on in `PRODUCTION_FUSE_CONFIG`, which **breaks** `child_process.fork` for Electron internals. Electron's own [utility-process docs](https://www.electronjs.org/docs/latest/api/utility-process) name "a SQLite server process" as the canonical use case and recommend Utility Processes precisely once `RunAsNode` is off. utilityProcess is therefore not merely preferred — it is the only working option.

---

## 2. Layered Control Architecture (layer → control → status)

| # | Layer | Control (engine/OS-enforced, not convention) | Status |
|---|-------|----------------------------------------------|--------|
| L0 | Renderer sandbox | `sandbox:true` + `app.enableSandbox()` + `contextIsolation` + `nodeIntegration:false` + nav/window/webview guards + `disableBlinkFeatures:Auxclick` | **DONE** |
| L0 | Renderer CSP | enforce + report-only, worker/wasm-aware; COOP/COEP/CORP for SharedArrayBuffer | **DONE** (finish nonce rollout = ADOPT-NEXT) |
| L0 | WASM host-import minimization | DuckDB-WASM + worker WASM instantiated with a minimal import object (no ambient `fetch`/FS reach) so a poisoned blob under `wasm-unsafe-eval` can't egress | **GAP** → ADOPT-NEXT (Pattern H) |
| L1 | Process isolation | `utilityProcess` per native engine (duckdb / llama / voice) + edge worker; main = broker | **ADOPT-NEXT** (Pattern A) |
| L2 | Capability IPC | `MessageChannelMain` per-engine ports = capability handles; revoke on window destroy | **ADOPT-NEXT** (Pattern B) |
| L3 | IPC trust boundary | trusted-sender allowlist (`isAllowedAppOrigin`) | **DONE but decentralized** → registry = ADOPT-NEXT (Pattern C) |
| L3 | Renderer↔main static boundary | `.dependency-cruiser.js` forbidden rule: `src/` may not import `electron`/`node:*`/native main-only pkgs — the **compile-time** enforcement of the whole trust topology | **GAP** (file modified on branch) → ADOPT-NEXT (Pattern C) |
| L3 | Per-channel schema | zod at the boundary, all channels | **PARTIAL** (DuckDB has it; llama/voice/collab pass-through) → ADOPT-NEXT (Pattern C) |
| L3 | DuckDB read-only | engine-enforced (`enable_external_access=false`, `lock_configuration=true`) instead of regex blocklist | **ADOPT-NEXT** (Pattern C, highest live risk) |
| L4 | Local-DoS bounds | per-channel max in-flight + max payload size + `AbortController` timeout on every capability port (llama tokens, voice buffers, the ~40 channels) | **GAP** (only DuckDB `memory_limit='4GB'`) → ADOPT-NEXT (Pattern C) |
| L4 | Loopback bind | `assertLoopbackHostname` fail-closed; `allowRetry:false` | **DONE** |
| L4 | HTTP self-defense | `src/middleware.ts` Host-allowlist + Sec-Fetch CSRF | **PARTIAL** (exists; no capability token; minimalMode-bypass unverified) → ADOPT-NEXT (Pattern D) |
| L5 | At-rest: secret | per-install 256-bit secret, cookie-encryption fuse | **DONE for cookie**, **PLAINTEXT file for secret** → safeStorage = ADOPT-NEXT (Pattern E) |
| L5 | At-rest: data | encrypt DuckDB catalog/Parquet + auth/app_setting SQLite | **GAP** → ADOPT-NEXT (Pattern E, second half) |
| L6 | Integrity: app code | `OnlyLoadAppFromAsar` + `EnableEmbeddedAsarIntegrityValidation` + `RunAsNode/NodeOptions/inspect` off | **DONE** |
| L6 | Integrity: V8 snapshot | CVE-2025-55305 — no app-side fix; needs Electron 42+ | **GAP / time-boxed** (Pattern F + sequencing) |
| L6 | Integrity: native tree | signed manifest of unpacked `.node/.dll/.wasm` verified before `dlopen` | **GAP** → ADOPT-NEXT (Pattern F) |
| L6 | Integrity: model weights | real sha256+bytes pinned; verify-on-load; HF `/resolve/<sha>/` | **INERT** (sha256:"", bytes:0, `/resolve/main/`) → ADOPT-NEXT (Pattern F) |
| L7 | Supply chain | `minimumReleaseAge`, `blockExoticSubdeps:true`, `onlyBuiltDependencies`, SHA-pinned actions, provenance generated | **DONE (resolve-time)**; verify/SBOM/osv-gate/fuse-audit = ADOPT-NEXT (Pattern G) |

**Cross-cutting offline invariants that must never regress (already correct):** `spellcheck:false` (no dictionary egress), no telemetry, no `certificate-verify` bypass, the `com.data-navigator.app://*` trusted-origin **wildcard already removed** (main.ts:906-908; only the exact custom-protocol origin remains), loopback-only HTTP by design (so no Let's Encrypt / no `Secure` cookie / no `upgrade-insecure-requests`). Record these so a future "fix" does not reintroduce egress.

---

## 3. Per-Pattern Adoption Guidance (the big moves)

### Pattern A — utilityProcess isolation (split the single trust domain)

**Target.** Reduce main to a pure broker. Move each native engine into its own `utilityProcess.fork()` child: `duckdb-worker`, `llama-worker`, `voice-worker`. The service files (`electron/duckdb-service.ts`, `llama-service.ts`, `voice-service.ts`) are already pure modules over module-state reached only through `ipcMain.handle`, so each becomes a worker entrypoint + thin message router, and the broker handler becomes a forward-to-port shim. Crash containment: `utilityProcess` emits `exit`; the broker restarts the worker on the existing retry path. Pin a `Session` at fork time ([electron#44727](https://github.com/electron/electron/issues/44727)) so each worker has its own network/identity context.

**Concrete steps.** (1) llama-worker FIRST (smallest, async-only, lowest blast radius) — proves fork + handshake end-to-end. (2) voice-worker. (3) edge worker (Pattern D's egress). (4) duckdb-worker LAST — move the 3 read conns + 1 write conn + PQueue + cancel tokens + Arrow transferables wholesale into the worker.

**Migration cost.** MEDIUM-HIGH, staged. **Be honest about the renderer:** the per-call preload *types* in `electron/preload.ts` are unchanged, but Pattern B simultaneously moves streaming (`llama:token`, `models:progress`) off `ipcRenderer.on` onto direct ports — so there **is** a renderer-side change (the promise/stream-over-port adapter). A and B are one rollout; budget it as such, not as "renderer untouched." Native ABI must still match Electron (electron-rebuild already required).

**Risk.** Concentrated in DuckDB (most state). Keep the in-main path behind a feature flag as fallback during rollout. `bonjour`/mDNS in a utilityProcess (UDP multicast + hidden network context) needs a smoke test. Sources: [utility-process](https://www.electronjs.org/docs/latest/api/utility-process), [fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox).

### Pattern B — Capability IPC via MessageChannelMain (per-engine ports)

**Target.** After the split, do **not** copy every Arrow window / WAV ArrayBuffer through the broker. Use Electron's documented port-brokering: broker creates `MessageChannelMain`, ships `port1` to the renderer once via `webContents.postMessage`, transfers `port2` to the worker via `child.postMessage(msg, [port2])` (worker reads it from `process.parentPort.once('message', e => e.ports[0])`). Then renderer ↔ worker talk directly; the broker is on the **grant** path, never the **data** path. **Capability semantics:** possession of a port *is* the authorization to call that engine; the broker decides at grant time (sender-frame check, one window) who gets which port; revoke = close the port on window destroy. The renderer holds three narrow capabilities (query/generate/voice), never a general bridge to a privileged process.

**Concrete steps.** Add a one-time `connect()` handshake in `preload.ts` that resolves the three engine ports. Move streaming callbacks (`onToken`, `onProgress`) from `ipcRenderer.on` to `port.onmessage`. Preserve existing per-call API shapes as a thin promise-over-port adapter so `window.electronDuckDB.*` callers are unchanged.

**Migration cost.** MEDIUM (folds into Pattern A's rollout — counted there, not double-counted).

**Risk.** Keep Arrow/audio as plain `Transferable ArrayBuffer` — some exotic transferables don't cross renderer→`MessagePortMain` cleanly ([electron#34905](https://github.com/electron/electron/issues/34905)). Already the case here. Sources: [message-ports](https://www.electronjs.org/docs/latest/tutorial/message-ports), [message-channel-main](https://www.electronjs.org/docs/latest/api/message-channel-main).

### Pattern C — Capability IPC registry + engine-enforced DuckDB read-only + boundary guardrails

**Target.** Replace the decentralized "remember to wrap in `withTrustedSender` + validate in the service" convention with a structural invariant: a single `define({ channel, input: zodSchema, limits, handler })` that is the **only** way to register a handler. It (a) records the channel in a frozen allowlist, (b) runs `assertTrustedSender` (keep existing `isAllowedAppOrigin` logic) **first**, (c) parses input through zod and rejects on failure, (d) **enforces per-channel DoS bounds** (max in-flight, max payload bytes, `AbortController` timeout — see below), (e) routes to the owning worker port. A handler cannot exist without an allowlist entry, a sender check, an input schema, and explicit limits. A ~100-line in-repo registry over existing zod schemas is correct here vs a new dependency (electron-trpc/EIPC) given the no-new-deps posture.

**Close the confused-deputy hole (CONFIRMED highest live risk).** `runReadOnlyQuery`/`runReadOnlyQueryArrow` accept **raw LLM-generated SQL** gated only by `assertReadOnlySql` (duckdb-service.ts:541-575), a prefix-allowlist + keyword-regex blocklist running on connections from a **writable instance with zero lockdown** (`DuckDBInstance.create(dbPath, { threads })` at :668 — no `access_mode`, no `enable_external_access`, no `lock_configuration`). The regex blocks `COPY`/`ATTACH`/`PRAGMA` as bare words, but **`read_csv('/etc/passwd')` inside a `SELECT` passes both gates** (starts with `SELECT`, contains no blocked keyword) — a live arbitrary-file-read / exfil primitive driven by attacker-influenced LLM output. Architectural fix: open the renderer-facing DuckDB connections from a **read-only instance** with `SET enable_external_access=false`, `SET disabled_filesystems='LocalFileSystem'`, `allow_unsigned_extensions=false`, autoinstall/autoload off, then `SET lock_configuration=true` so the renderer can never re-enable them. Run registration/`COPY` on a separate **writer** connection (broker-mediated). The engine, not a regex, becomes the wall; the regex stays as defense-in-depth.

**Local-DoS bounds (new L4 control).** The registry is the natural enforcement point. DuckDB has `memory_limit='4GB'` (confirmed :686), but llama token-generation, voice audio buffers, and the ~40 channels have **no concurrency/rate/size caps** — a renderer assumed XSS-compromised, or a malicious file, can OOM/hang the in-process engines. Attach to each channel: max in-flight requests, max payload size, and a cancel-on-timeout `AbortController` wired to the existing DuckDB cancel tokens and the llama generation handle.

**Compile-time boundary guardrails (new L3 control).** Add to `.dependency-cruiser.js` (already modified on this branch) a forbidden rule: `src/` (renderer) may not import `electron`, `node:*`, or native main-only packages (`@duckdb/node-api`, `better-sqlite3`, `node-llama-cpp`, `sherpa-onnx-node`, `sqlite-vec`, `onnxruntime-node`, `@hocuspocus/*`, `ws`, `conf`, `bonjour-service`); scope with `dependencyTypesNot:['type-only']`, exempt `src/workers`. Plus a CI grep banning bare `ipcMain.handle`. This makes the renderer↔main trust boundary a **compile-time** invariant — the cheapest, highest-leverage line in the program.

**Concrete steps.** (1) Build the registry + per-channel limits; migrate the ~40 handlers mechanically. (2) Write the missing llama/voice/collab zod schemas. (3) Split DuckDB writer (registration) from read-only renderer connections — the code already separates `writeConn` vs `readConns` (:672-677), so open `readConns` from a read-only instance handle. (4) Add the cruiser rule + the `ipcMain.handle` CI ban.

**Migration cost.** LOW-MEDIUM (registry + schemas + limits + cruiser rule). **MEDIUM-HIGH (DuckDB read-only split), not LOW** — the Moudir swarm's legitimate `read_csv`/`read_parquet` file-loading queries will be **rejected by the engine**, not just the regex, so you must **budget rerouting every file-reading query** to the writer/structured-endpoint path, and audit that `previewDataset`/`profileDataset` only touch already-registered views. Do not treat this as "cheap because it's a refactor."

**Risk.** Highest live-risk item — do it FIRST, but enter it knowing the SQL-rerouting tail is the real cost. Sources: [securing-duckdb](https://duckdb.org/docs/operations_manual/securing_duckdb/overview.html), [duckdb#14568](https://github.com/duckdb/duckdb/pull/14568), [security](https://www.electronjs.org/docs/latest/tutorial/security).

### Pattern D — localhost CSRF / DNS-rebinding middleware (finish + harden)

**Current (verified).** `src/middleware.ts` enforces a **Host-header allowlist** (DNS-rebinding defense) and a **Sec-Fetch-Site cross-site CSRF reject** — good. It is **PARTIAL**: no per-launch capability token (no server-identity proof), no Origin/Referer fallback for non-Sec-Fetch clients, and the file's own comment (lines 12-16) flags an **unverified bypass** — Next 16 `startServer({ minimalMode })` may skip middleware for some paths. better-auth still guards only `/api/auth/*`, and the `/api/settings/[namespace]/[key]` PUT/DELETE routes write `app_setting` SQLite with **zero auth or origin check** (route.ts:34-50) — a live, browser-reachable write primitive. *(Note: the trusted-origin wildcard drop in the prior draft is already shipped at main.ts:906-908 — do not re-prescribe it.)*

**Target.** (1) **Verify** the minimalMode path with the exact curl the file documents: `curl -H "Host: evil.test" http://127.0.0.1:3000/` must return 403; if it returns 200, move the Host/Sec-Fetch checks into a **request-listener wrapper** around the `http.Server` in `startNextJSServer` (main.ts) — the load-bearing altitude that also covers `/_next` assets. (2) Add a **per-launch capability token**: mint `crypto.randomBytes(32)` in main, inject as a frozen preload constant via `contextBridge`, require it as `X-DN-Token` on non-public requests. A foreign origin cannot read it (contextIsolation + different origin) nor set a custom header on a simple cross-site request without a preflight you reject. This also gives **server-identity** verification: if a hostile local process squats :3000 (`allowRetry:false` already fails closed), the renderer detects a missing/invalid token and refuses. (3) Add `Vary: Sec-Fetch-Site` so caches don't poison the decision.

**Migration cost.** MEDIUM. Token plumbing touches preload + main + the renderer fetch wrapper.

**Risk.** The renderer must attach `X-DN-Token` to its **own** same-origin fetches or it locks itself out — stage as **log-only for one cycle**, watch for self-blocks across upload→DuckDB, Moudir swarm, voice, telecom grid, snapshots, then enforce. Offline-compatible: Sec-Fetch/Host/Origin work on plain `http://localhost` (a "trustworthy origin"); the token is minted locally per launch. Sources: [Sec-Fetch-Site](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site), [Jupyter security](https://jupyter-server.readthedocs.io/en/latest/operators/security.html), [Oligo 0.0.0.0-day](https://www.oligo.security/blog/0-0-0-0-day-exploiting-localhost-apis-from-the-browser), [Filippo on CSRF](https://words.filippo.io/csrf/).

### Pattern E — At-rest encryption with a key hierarchy + safe migration

**Target key hierarchy (single source of truth, offline):**

```
KEK = Electron safeStorage  (Windows DPAPI / macOS Keychain / Linux libsecret)
  └─ wraps → DEK (one per-install crypto.randomBytes(32), stored ONLY as a
              safeStorage-wrapped blob at userData/.../keyring/dek.enc)
       ├─ raw DEK → better-sqlite3-multiple-ciphers PRAGMA key  [auth + app_setting DB]
       ├─ raw DEK → DuckDB ATTACH ... (ENCRYPTION_KEY ...)       [catalog + WAL + spill]
       ├─ HKDF(DEK,'parquet') → DuckDB PRAGMA add_parquet_key    [datasets/*.parquet + exports]
       └─ folds in BETTER_AUTH_SECRET (replaces the plaintext file)
```

**Why it matters here.** The auth secret is well-handled today **except** it's a plaintext file whose `0600` mode is a **no-op on Windows (NTFS)** — the primary target OS — so any same-user process reads it. Worse, the **high-value data** sits unencrypted next to it: `data-navigator.duckdb` + `datasets/*.parquet` (the actual telecom rows), `collab-hub.sqlite`, and the auth SQLite holding password hashes + OAuth access/refresh/id tokens + every persisted setting blob. The cookie-encryption fuse already proves the DPAPI dependency works on this target.

**Concrete steps.** (1) **First and cheapest:** swap `loadOrCreateAuthSecret`'s file I/O for `safeStorage.encryptStringAsync`; one-time migration of the existing plaintext secret. (2) **Fail-closed rule the docs hide:** on Linux, check `safeStorage.getSelectedStorageBackend() !== 'basic_text'` before trusting it — `basic_text` "encrypts" with a hardcoded Chromium password = plaintext-equivalent; refuse to persist secrets in that case. (3) Auth SQLite → `better-sqlite3-multiple-ciphers` (drop-in API), keyed **before** any other pragma. (4) DuckDB → re-architect `init()` from `create(path)` to `:memory:` + `ATTACH '<db>' (ENCRYPTION_KEY ...)`, same key on all 4 connections; bundle the `httpfs` (OpenSSL) extension **locally** for fast AES and to avoid the documented ATTACH-hangs-offline bug ([duckdb#20797](https://github.com/duckdb/duckdb/issues/20797)). (5) Parquet cache → `add_parquet_key` + `ENCRYPTION_CONFIG {footer_key}`.

**Migration discipline (never lock users out).** SQLite: do **not** in-place `rekey` a live WAL DB; instead `wal_checkpoint(TRUNCATE)` → `sqlcipher_export()` into a fresh keyed file → verify (`integrity_check` + row count) → atomic rename → delete plaintext. DuckDB: `ATTACH plain; ATTACH enc (ENCRYPTION_KEY ...); COPY FROM DATABASE plain TO enc;` → verify → rename. Detection = try keyed open; on failure treat as plaintext and convert. Idempotent, resumable, verify-before-delete. Provide a **user-initiated recovery-key export** because safeStorage is OS-user-bound: a profile reset / machine move makes the wrapped DEK unrecoverable (no cloud escrow in an offline app).

**Honest threat boundary (document, don't over-trust).** DPAPI/safeStorage stops a **stolen disk** and **another OS user**. It does **not** stop same-user malware (it can call `CryptUnprotectData` under the app's identity) or a runtime debugger. This is at-rest / lost-device protection, not anti-local-malware. For genuinely sensitive ops, layer an optional Argon2/scrypt user master password with a short unlock window.

**Anti-pattern (do NOT do).** `conf`/`electron-store` `encryptionKey` is obfuscation, not security (key in bundle; default AES-256-CBC unauthenticated/bit-flippable). `@better-auth/electron` already wraps token blobs with safeStorage — standardize on that.

**Migration cost & ordering.** LOW (secret swap) → MEDIUM (SQLCipher rekey, another native ABI rebuild) → MEDIUM-HIGH (DuckDB ATTACH-with-key + httpfs bundling + Parquet config threaded through every `read_parquet`). **Critical ordering correction:** the **auth-DB SQLCipher rekey does NOT depend on the duckdb-worker** — it is gated only by a native rebuild, so it lands in step 2 alongside the secret swap, protecting password hashes + OAuth tokens **immediately** rather than waiting for the entire worker-split program. Only the **DuckDB/Parquet** at-rest work waits for the duckdb-worker (so the DEK lives only in the isolated worker). Sources: [safe-storage](https://www.electronjs.org/docs/latest/api/safe-storage), [DuckDB encryption](https://duckdb.org/2025/11/19/encryption-in-duckdb.html), [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers), [DPAPI deep-dive](https://chenguangliang.com/en/posts/blog169_electron-credential-storage-security/).

### Pattern F — Native + model integrity chain (close the unverified-blob gap)

**Target chain (each link verifies the next before trusting it).**
- **Link 1 (trust root, time-boxed):** bump **Electron 41 → 42+**. The app is in the exact CVE-2025-55305 affected population (both ASAR fuses on + user-writable per-user MSI); the V8 snapshot (`browser_v8_context_snapshot.bin`) is **not** covered by ASAR fuses, and an attacker with install-dir write backdoors the app with zero ASAR change. There is **no app-side workaround** — v42's `ValidateV8Snapshot` (commit 23a0293) is the fix. Electron 41 EOLs **2026-08-25**. Optionally add `LoadBrowserProcessSpecificV8Snapshot:true`. Re-rebuild all native modules + re-flip + re-audit fuses after the bump.
- **Link 2 (unpacked tree):** the large `asarUnpackDirs` native tree (`@duckdb`, `better-sqlite3`, `node-llama-cpp`, `sherpa-onnx-node`, `sqlite-vec`, onnxruntime) + the spawned Next `start-server.js` live **outside** ASAR integrity (ASAR validates only the archive header). Emit an `integrity-manifest.json` (path→sha256) of every unpacked `.node/.dll/.wasm/.gguf` + the server entry at package time; sign it (Ed25519/minisign) with a build key; store the manifest + signature **inside** app.asar (which IS header-validated).
- **Link 3 (verify-before-dlopen):** add `electron/integrity.ts` at the top of `main.ts`, **before** any `require` of the native modules and before `startNextJSServer`: verify the manifest signature against an in-bundle public key, then sha256 each artifact; `app.quit()` on any mismatch. Native services are `require`d lazily today, so inserting the gate before the first `ensureModel()`/`duckdbService.init()` is feasible. Hash large GGUF **lazily at first load**, not at boot.
- **Link 4 (model weights — currently INERT):** confirmed `sha256:""`, `bytes:0`, and HF `/resolve/main/` (mutable branch, Bandit B615 / CWE-494) in `model-download-service.ts:53-64`. The verify code path **already exists** (`:225-229` rm's the temp file on mismatch) — so this is **filling values, not writing logic**: pin real sha256+bytes, switch to `/resolve/<commit-sha>/`, ship the hash list inside the ASAR, and **re-verify on load** in the (eventually isolated) llama/voice worker so a file swapped on disk *after* download is caught. With weights loaded inside the sandboxed workers (Pattern A), even a forged blob that slips through is contained.
- **Link 5 (CI fuse audit):** `npx @electron/fuses read` over the built `.exe`, fail on drift vs `PRODUCTION_FUSE_CONFIG` (single source of truth); add `strictlyRequireAllFuses:true` to the `flipFuses` call so a new fuse in a future Electron major hard-fails rather than defaulting insecure.

**Migration cost.** HIGH but staged. Link 1 (Electron bump) dominates — re-runs electron-rebuild for all native modules, re-validates ABIs, gate behind a native-lane smoke test. Links 4 + 5 are LOW. Links 2-3 are MEDIUM (one forge hook + ~150-line verifier; the only real risk is load-order — the gate must precede the first native `require`). Build-time signing needs a key-custody decision (same custody as the EV cert).

**Offline fit.** Signature verify uses an in-ASAR public key (no CA/OCSP/cloud); GGUF hashes are pinned at build, re-checked locally. Sources: [GHSA-vmqv-hx8q-j7mg](https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg), [asar-integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity), [Trail of Bits snapshot backdoor](https://blog.trailofbits.com/2025/09/03/subverting-code-integrity-checks-to-locally-backdoor-signal-1password-slack-and-more/), [HF revision pinning](https://huggingface.co/docs/huggingface_hub/en/guides/download).

### Pattern G — Supply-chain pipeline (verify, don't just generate)

**Already DONE (verified — do not redo):** `minimumReleaseAge:10080`, **`blockExoticSubdeps:true`** (pnpm-workspace.yaml:1), `onlyBuiltDependencies` allowlist, top-level `permissions:{}` + per-job least privilege, SHA-pinned third-party actions, CodeQL + dependency-review + Scorecard, provenance **generated** via `attest-build-provenance@v3`.

**ADOPT-NEXT (the gaps):**
- **Gate the provenance plan FIRST (don't build theater).** GitHub attestations are a **no-op on non-Enterprise private repos**. Before any provenance-verify work, confirm the repo's plan supports attestations. If it's private on Pro/Team, **cut the provenance-verify lane entirely** and rely on EV signing + the fuse-read audit. Only if attestations actually work: add a release gate `gh attestation verify <msi> --signer-workflow <repo>/.github/workflows/electron-windows.yml`, fail-closed, and ship the Sigstore bundle for offline `--bundle` verification.
- **Blocking vuln gate** — replace advisory `pnpm audit` (`continue-on-error`) with `google/osv-scanner-action` on the committed lockfile; triage pre-existing advisories with a dated ignore file, not a revert.
- **`verifyDepsBeforeRun:error`** — one-line pnpm-workspace.yaml add so `pnpm run`/`exec` refuse a drifted node_modules.
- **lockfile-lint** — assert every resolved URL is https from the registry host with an integrity hash (catches lockfile-poisoning that release-age can't see).
- **SBOM** — CycloneDX (`@cyclonedx/cyclonedx-npm`) per release, attached; the queryable inventory you'll need to answer "are we affected by the next Shai-Hulud-class compromise" in an offline app with no telemetry.
- **Fail-closed EV/HSM signing** — `forge.config.ts:61-70` falls back to an **empty cert config** when env is unset → silently ships **unsigned** on release. Throw when `IS_RELEASE && no creds`; migrate `.pfx` → Azure Trusted Signing / cloud HSM (post-2023 EV mandate makes OV `.pfx` worthless to SmartScreen). Largest cost is **external** (Azure identity validation, days) — provision ahead of GA.

**Migration cost.** LOW for osv-scanner, `verifyDepsBeforeRun`, lockfile-lint, SBOM, fuse-audit (each ~1 hr / one-line). MEDIUM-HIGH for EV/HSM signing (mostly external). Sources: [pnpm supply-chain](https://pnpm.io/10.x/supply-chain-security), [osv-scanner-action](https://github.com/google/osv-scanner-action), [attest-build-provenance](https://github.com/actions/attest-build-provenance), [@electron/fuses](https://github.com/electron/fuses), [code-signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

### Pattern H — Renderer-tier WASM host-import minimization

**Target.** The entire blueprint above is main-process-centric; this closes the renderer analog. The renderer instantiates DuckDB-WASM + ~35 workers under a CSP that necessarily permits `wasm-unsafe-eval`. A poisoned or tampered WASM blob should not be able to reach `fetch`/`XMLHttpRequest`/FS from inside the module. Instantiate each WASM module with a **minimal, explicit `importObject`** — supply only the host functions the module legitimately needs, and never pass ambient `fetch`/network/FS closures into the import namespace. This is the renderer-tier counterpart to Pattern A's process isolation and complements CSP: even if a blob executes, its reach is bounded to what you handed it.

**Concrete steps.** Audit the DuckDB-WASM and worker `WebAssembly.instantiate`/`instantiateStreaming` call sites; replace any broad/default import objects with a curated allowlist of imports; route any genuinely-needed I/O back through the capability ports (Pattern B), not through a host import the WASM can call directly.

**Migration cost.** LOW-MEDIUM (one paragraph of audit per WASM call site; most DuckDB-WASM imports are already narrow). **Risk.** LOW — additive hardening; verify no legitimate import is dropped via the existing worker smoke tests. Sources: [WebAssembly.instantiate / importObject](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiate_static), [security](https://www.electronjs.org/docs/latest/tutorial/security).

---

## 4. Recommended Sequencing

Ordered by **(highest live risk ↓ blast radius) first, building the seam everything else plugs into**:

1. **Pattern C — registry + per-channel DoS bounds + engine-enforced DuckDB read-only + cruiser boundary rule.** Pure refactor, no process changes; removes the **raw-SQL-regex-as-boundary** confused-deputy hole (the top live risk), adds local-availability bounds, makes the renderer↔main boundary a compile-time invariant, and builds the seam Patterns A/B plug into. **Budget the SQL-rerouting tail (MEDIUM-HIGH), not just the registry.**
2. **Pattern E first half: safeStorage secret swap + Linux `basic_text` fail-closed + auth-DB SQLCipher.** Small, isolated, high value; fixes the NTFS-0600-no-op on the primary OS **and** encrypts password hashes + OAuth tokens **now** — auth-DB encryption is decoupled from the worker split and must not wait.
3. **Pattern D finish: verify the minimalMode middleware path + capability token (staged log-only).** Closes a live remote-reachable write primitive (`/api/settings` PUT/DELETE). *(Wildcard drop already shipped — skip.)*
4. **Pattern G quick wins: gate the provenance plan, then osv-scanner blocking gate, `@electron/fuses read` CI audit + `strictlyRequireAllFuses`, fail-closed signing guard, SBOM, lockfile-lint, `verifyDepsBeforeRun`.** Cheap, high assurance, mostly CI.
5. **Pattern F Link 1: Electron 41 → 42.** Time-boxed by the 2026-08-25 EOL and the CVE-2025-55305 no-workaround; do before the worker splits so native rebuilds happen once.
6. **Pattern A/B + Pattern H: llama-worker → voice-worker → edge worker → duckdb-worker (last)**, each over a MessagePort capability handle; fold WASM host-import minimization into the renderer-side adapter work in the same rollout.
7. **Pattern F Links 2-5 (native + model integrity)** and **Pattern E second half (DuckDB/Parquet at-rest)** — layer on **after** the workers exist; isolation + integrity + at-rest compound (forged or tampered blobs are contained to a secret-less worker, and the DEK lives only in the isolated duckdb-worker).

**Hard-constraint check:** every step is offline-compatible. `utilityProcess`, `MessageChannelMain`, `safeStorage` (DPAPI/Keychain/libsecret), DuckDB-native encryption, in-ASAR-signed manifests, Sec-Fetch/Host checks on loopback, minimal WASM imports, and locally-pinned model hashes need no cloud control plane, no Let's Encrypt, no telemetry. The only two egress paths (HF fetch, LAN collab) are explicitly quarantined into the edge worker; the one build-time network touch (Authenticode timestamp server) is never runtime egress.

**Deliberately out of scope (low ROI for an offline single-publisher app):** byte-reproducible MSI builds (stop at app.asar determinism) and SLSA L3 / reusable signing workflows. Chasing a byte-identical signed WiX artifact, or SLSA provenance that is a no-op on a private non-Enterprise repo, is time spent for near-zero marginal security here — EV signing + the fuse-read audit + the integrity manifest cover the real threat.

---

**Load-bearing repo files (absolute):** `D:\data-navigator\electron\main.ts` (broker, minimalMode wrapper, token mint, trusted-origins already pinned at :902-910), `electron\security.ts`, `electron\duckdb-service.ts` (read-only instance + ATTACH key; `assertReadOnlySql`:541, `DuckDBInstance.create`:668, `memory_limit`:686), `electron\preload.ts` (port handshake + token constant), `electron\model-download-service.ts` (sha256/bytes/`/resolve/<sha>/`; verify path already at :225-229), `electron\llama-service.ts`/`voice-service.ts`/`collab-hub-service.ts` (worker entrypoints), `forge.config.ts` (`strictlyRequireAllFuses`, fail-closed signing :61-70, manifest hook), `src\middleware.ts` (token + minimalMode verification — exists, PARTIAL, self-flagged at :12-16), `src\app\api\settings\[namespace]\[key]\route.ts` (unauth'd PUT/DELETE :34-50), `src\platform\auth\auth-database.ts` (SQLCipher), `.dependency-cruiser.js` (renderer boundary rule — modified on branch), `pnpm-workspace.yaml` (`verifyDepsBeforeRun`; `blockExoticSubdeps:true` already at :1), and new files `electron\integrity.ts` + the per-engine worker entrypoints. Backlog: `docs\security\localhost-hardening-catalog.md`.
