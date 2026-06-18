# Releasing Data Navigator for Windows

> A practical, project-specific guide to cutting the **first** Windows release of
> Data Navigator. This is not generic Electron advice — every step below matches
> *this* repo's actual pipeline (`forge.config.ts`, the Changesets config, and the
> `release.yml` / `electron-windows.yml` workflows).

---

## 0. TL;DR — the happy path

You don't run a build command to release. You **merge a changeset, then merge the
auto-generated Release PR, then publish the draft Release**. CI does the rest.

```
1. On your feature branch:   pnpm changeset      # describe the change + pick bump level
2. Merge that branch to main.
3. CI opens a "Release: version Data Navigator" PR (bumps version + writes CHANGELOG).
4. Merge that Release PR.
5. CI cuts tag v<version> + a DRAFT GitHub Release, builds the WiX MSI on
   windows-latest, and attaches it to the draft Release (with a provenance attestation).
6. Go to GitHub → Releases → find the draft → download & test the .msi → click "Publish release".
```

That's the whole loop. The rest of this doc explains each step, the two gotchas
that affect first-time users, and the manual fallback if CI misbehaves.

---

## 1. How the pipeline actually works

Four moving parts, in order:

| Component | File | Role |
|---|---|---|
| **Changesets** | `.changeset/config.json`, `package.json` scripts | Decides the version number, writes the changelog, creates the git tag + GitHub Release. The root package is **private** with `privatePackages: { version: true, tag: true }`, so `changeset publish` skips npm and just tags `v<version>` + creates a Release. |
| **Release workflow** | `.github/workflows/release.yml` | Runs on every push to `main`. Runs the Changesets action; when changesets are pending it opens/updates the **Release PR**; when that PR merges it **publishes** (tag + Release) and sets `published=true`. |
| **Windows build (reusable)** | `.github/workflows/electron-windows.yml` | Called by `release.yml` *only when `published=true`*. Builds the MSI on `windows-latest`, signs a build-provenance attestation, and attaches `out/make/**/*.msi` to the Release. |
| **Forge maker + publisher** | `forge.config.ts` | `MakerWix` produces a single x64 **`.msi`**. `PublisherGithub` is configured with `draft: true`. |

Key consequences of this design:

- **Pushing changesets to `main` does not build an MSI.** The Windows job is gated
  on `needs.changesets.outputs.published == 'true'`, which is only true *after you
  merge the Release PR*. This is intentional — it prevents a build per commit.
- **The tag is created with `GITHUB_TOKEN`.** GitHub deliberately does **not**
  start new workflow runs from `GITHUB_TOKEN`-pushed tags (loop prevention). That's
  why the MSI build is chained via `needs:` in `release.yml` instead of an
  `on: push: tags` trigger. Don't "fix" this by adding a tag trigger — it won't fire.
- **Releases come out as DRAFTS.** Both the Forge publisher (`draft: true`) and the
  CI attach step (`draft: true`) leave the Release unpublished. You must manually
  click **Publish release** in the GitHub UI. This is your final human gate to test
  the MSI before anyone can download it.

---

## 2. Pre-flight checklist

### One-time (before your very first release)

- [ ] **Decide the version number** (see §3). You're at `0.1.0` today.
- [ ] **Pick a release channel.** Default is stable. For an early/test build set
      `PRERELEASE=true` or `CHANNEL=beta`/`alpha` to mark the GitHub Release as a
      pre-release (`forge.config.ts` reads these).
- [ ] **Decide on the two known gaps** (§5): unsigned installer and auto-update.
      Neither blocks a first release, but you should *choose* knowingly.
- [ ] **Confirm the model story** (§5.3). The MSI ships **without** the GGUF LLM by
      design, so AI features won't work until the user installs a model. Decide what
      first-run users see.

### Every release

- [ ] All PRs merged that you want in this version.
- [ ] At least one changeset exists in `.changeset/` (the `Changesets` PR check
      enforces this per-PR via `changeset:status --since=origin/main`).
- [ ] `pnpm run verify` is green locally or on CI (`verify` = full `quality` +
      `build`). The Windows job runs this before making the MSI, so a red `verify`
      fails the release build.

---

## 3. Choosing the version number for "v1"

You're on `0.1.0`. There is already **one pending changeset**
(`.changeset/calm-pandas-release.md`, a `patch`), so the next Release PR would
currently produce **`0.1.1`**.

Changesets bumps real SemVer from the current version:

| Pending bump | `0.1.0` becomes |
|---|---|
| `patch` | `0.1.1` |
| `minor` | `0.2.0` |
| `major` | `1.0.0` |

**Recommendation:** unless this build is genuinely production-grade and stable,
**ship a `0.x` release** (e.g. `0.1.0`/`0.2.0`). It's honest signalling for a
first public build and sets expectations. Jump to `1.0.0` only when you mean
"this is stable and I'll support it." (Changesets takes the **highest** bump
across all pending changesets, so one `major` wins.)

- To ship as **`0.1.1`**: do nothing — the existing changeset already implies it.
- To ship as **`1.0.0`**: edit `.changeset/calm-pandas-release.md` and change the
  bump line from `"data-navigator": patch` to `"data-navigator": major`, **or** add
  a new major changeset (`pnpm changeset` → Major).

---

## 4. Step-by-step: cutting the release

### Step 1 — Make sure your changes carry a changeset

On the branch with your work (you're on `chore/telecom-dedup` right now):

```powershell
pnpm changeset
```

It will ask for the bump level (patch/minor/major) and a one-line summary. That
summary becomes a CHANGELOG entry and the body of the GitHub Release, so write it
for users, not for yourself. Commit the generated `.changeset/*.md` file.

> If a PR intentionally needs no version bump (docs, CI tweaks), you can add an
> empty changeset with `pnpm changeset --empty` to satisfy the PR check.

### Step 2 — Merge to `main`

Merge your branch. `release.yml` runs on the push to `main`, sees pending
changesets, and opens (or updates) a PR titled **"Release: version Data
Navigator"**. That PR:

- bumps `package.json` `version`,
- consumes the `.changeset/*.md` files,
- writes/updates `CHANGELOG.md`.

**Do not edit version numbers by hand** — let this PR do it.

### Step 3 — Merge the Release PR

Review the version bump and CHANGELOG in that PR, then merge it. On *this* push to
`main`, `release.yml` runs again and this time `changeset publish` runs:

- creates the **`v<version>`** git tag,
- creates a **draft GitHub Release** for that tag,
- sets `published=true`, which triggers the `windows-msi` job.

### Step 4 — Let CI build & attach the MSI

The `windows-msi` job (in `electron-windows.yml`, called with `release: true`):

1. checks out the exact `v<version>` tag,
2. runs `pnpm run verify` (quality gate + build),
3. runs `pnpm run electron:make` → produces `out/make/wix/x64/*.msi`,
4. creates a **build-provenance attestation** over the MSI (supply-chain proof),
5. attaches the MSI to the **draft** Release,
6. also uploads the MSI as a workflow artifact (`data-navigator-windows-msi`).

This job runs on `windows-latest` and can take a while (timeout is 90 min) — the
WiX MSI maker, native-module rebuilds (`better-sqlite3`, `@duckdb`,
`sherpa-onnx-node`, `sqlite-vec`, `node-llama-cpp`), and the pnpm→flat
`node_modules` dereferencing all run here. The same `electron:make` runs on every
PR that touches build paths, so the toolchain is already proven on CI.

### Step 5 — Test, then publish the draft

1. GitHub → **Releases** → open the draft for `v<version>`.
2. Download the `.msi`, install it on a **clean Windows machine/VM** (not your dev
   box — your dev box has the toolchain and a real `models/` dir that the MSI won't
   ship). Confirm:
   - the app launches (no "Cannot find module …start-server" — that's the symptom
     the `makeNodeModulesPortable` flattening exists to prevent),
   - core flows work (CSV import → telecom report),
   - you understand what happens with AI features absent a model (§5.3).
3. If good, click **Publish release**. Until you do, no end user can see it and the
   auto-updater would never pick it up.

---

## 5. Three things to know before users install

### 5.1 The installer is **unsigned** → SmartScreen warnings

`forge.config.ts` only signs if `WINDOWS_CERTIFICATE_FILE` **and**
`WINDOWS_CERTIFICATE_PASSWORD` are set; CI doesn't set them, so the MSI ships
**unsigned**. On a clean machine users will see **"Windows protected your PC /
Unknown publisher"** (SmartScreen) and must click *More info → Run anyway*.

**For a first release this is acceptable** — just tell testers to expect it. When
you're ready to remove the warning, the 2026 landscape is:

- **All** code-signing certs (OV *and* EV) now require the private key on a
  **hardware token (FIPS 140-2 L2 / EAL4+) or a cloud HSM** — no more PFX-on-disk
  for new certs (rule in effect since June 2023).
- Since **March 2024**, EV no longer gets instant SmartScreen reputation; OV and EV
  build reputation **equally** through download volume. So paying extra for EV buys
  you little on the SmartScreen front now.
- **Azure Trusted Signing** (~$10/mo) is Microsoft's modern cloud-signing service
  and the cheapest way to get a trusted signature; as of late 2025 it's open to
  individual developers in the US/Canada with a verifiable history. Check
  eligibility for your region/identity.

When you do sign: set the two env vars (or migrate to a cloud-signing integration)
and the WiX maker will sign automatically — no code change needed.

### 5.2 Auto-update is wired but **will not function** as-is

`electron/main.ts` calls `update-electron-app({ repo: "aliammari1/data-navigator" })`,
which uses the free `update.electronjs.org` service. That service has hard
requirements your setup does **not** currently meet:

1. **Repo must be public.** Your origin (`The-Data-Navigator/data-navigator`) is
   **private**. The service ignores private repos.
2. **Wrong repo target.** `main.ts` points at `aliammari1/data-navigator`, which is
   **not** your release origin (`The-Data-Navigator/...`). Even made public, it'd
   poll the wrong place.
3. **Releases must be published, non-draft, non-prerelease, valid SemVer.** Your
   releases are created as **drafts** — they're invisible to the updater until you
   publish (and prereleases are skipped entirely).
4. **MSI ≠ Squirrel.** `update-electron-app` drives Electron's `autoUpdater`, which
   on Windows expects **Squirrel.Windows**. You ship a **WiX MSI**. Plain MSI
   installs are not updated by that path. (`electron-wix-msi` has its *own* optional
   Squirrel integration, but that's a different mechanism you haven't enabled.)

**For v1, treat the app as having no in-app auto-update.** The
`update-electron-app` call is guarded and just logs a warning if setup fails, so it
won't crash anything — users update by downloading the next MSI manually. Document
that. If/when you want real auto-update later, the cleanest route is the
**Squirrel.Windows maker** (commented out in `forge.config.ts`) + a **public**
releases repo + fixing the repo string in `main.ts` + publishing non-draft
releases. That's a deliberate follow-up project, not a first-release task.

### 5.3 The MSI ships **without** the LLM model (by design)

CI never downloads the multi-GB GGUF (see the note in `electron-windows.yml`;
`forge.config.ts` copies `./models` only `IfExists`). So the installed app has no
local model, and AI features will **hang/fail until the user drops a GGUF into
`%APPDATA%/Electron/models/llm`**. For a first release, pick one:

- **Document it**: ship release notes telling users where to put a model.
- **Gate gracefully**: make sure AI screens show a clear "no model installed" state
  rather than spinning forever.
- **(Heavier) bundle a small model**: only if you accept a much larger MSI.

At minimum, make sure first-run doesn't look broken when the model is absent.

---

## 6. Manual / local release (fallback)

If the CI chain breaks and you need a build now, you can drive Forge directly.
These run on **your machine** and will include your local `models/` dir if present.

```powershell
# Build the staged app + Next standalone, then PACKAGE (no installer):
pnpm run electron:package      # -> out/data-navigator-win32-x64/

# Build the actual MSI installer locally:
pnpm run electron:make         # -> out/make/wix/x64/*.msi

# Build AND publish straight to a GitHub Release (uses PublisherGithub, draft:true):
$env:GITHUB_TOKEN = "<a token with repo scope>"
pnpm run electron:publish
```

To **sign** a local build, set the cert env vars first:

```powershell
$env:WINDOWS_CERTIFICATE_FILE = "C:\path\to\cert.pfx"      # or use a token/HSM integration
$env:WINDOWS_CERTIFICATE_PASSWORD = "..."
pnpm run electron:make
```

You can also re-run **just** the Windows build against an existing tag via the
`workflow_dispatch` trigger on the **Electron Windows** workflow in the Actions
tab — set `release: true` and `release-tag: v<version>` to rebuild and re-attach
the MSI to that Release. Useful if the build failed *after* the tag was cut.

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Merging to `main` didn't build an MSI | Expected. Only **merging the Release PR** sets `published=true` and triggers the Windows job. |
| No Release PR appeared | No pending changesets on `main`. Add one (`pnpm changeset`) and push. |
| Windows job skipped | `needs.changesets.outputs.published` was `false` — i.e. there was nothing to publish. |
| `verify` fails the release build | Fix the failing `quality`/`build` step; the release won't proceed until `pnpm run verify` is green. |
| App crashes on a clean PC with "Cannot find module …start-server" | A `node_modules` symlink survived into the MSI. The `makeNodeModulesPortable` pass in `forge.config.ts` exists to prevent exactly this; check its "Portability OK (0 symlinks)" log lines in the build output. |
| MSI built but not attached to the Release | The attach step targets `inputs.release-tag`; confirm the tag resolved (the `Resolve release tag` step in `release.yml`) and that `fail_on_unmatched_files` didn't trip (no MSI in `out/make/**`). |
| SmartScreen blocks the installer | Expected for an unsigned MSI (§5.1). Sign it, or tell testers to *More info → Run anyway*. |
| Released but the app never auto-updates | Expected (§5.2). No working auto-update path today. |

---

## 8. First-release decisions — quick recommendations

| Decision | Recommendation for v1 |
|---|---|
| Version number | Stay on **`0.x`** (you're set up for `0.1.1`) unless you're confident it's stable, then `1.0.0`. |
| Channel | Mark it a **pre-release** (`PRERELEASE=true`) if it's a first test build, so expectations are set. |
| Code signing | **Skip for the very first build**; document the SmartScreen step. Plan **Azure Trusted Signing** as the follow-up. |
| Auto-update | **Ship without it**; document manual update. Treat real auto-update as a separate later project. |
| Model | **Document** the model-install step and make sure AI screens degrade gracefully when no model is present. |
| Final publish | Always **test the MSI on a clean machine before clicking Publish** on the draft Release. |

---

## Sources

- [update-electron-app (electron/update-electron-app)](https://github.com/electron/update-electron-app)
- [update.electronjs.org service & requirements](https://github.com/electron/update.electronjs.org)
- [Electron — Publishing and Updating tutorial](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating)
- [Electron Forge — WiX MSI maker](https://www.electronforge.io/config/makers/wix-msi)
- [Electron Forge — Squirrel.Windows maker](https://www.electronforge.io/config/makers/squirrel.windows)
- [Electron Forge — Signing a Windows app](https://www.electronforge.io/guides/code-signing/code-signing-windows)
- [electron-wix-msi (auto-update via embedded Squirrel)](https://github.com/electron-userland/electron-wix-msi)
- [Microsoft Learn — SmartScreen reputation for developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Microsoft Learn — Code signing options for Windows developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [How to Sign a Windows App (2025 token/HSM rules)](https://securityboulevard.com/2025/12/how-to-sign-a-windows-app-with-electron-builder/)
