# Security review — 2026-10-01

> Historical snapshot. The repository is now private under a personal account;
> its current release gates, signing identities, and GitHub feature availability
> are documented in [Release security](../.github/RELEASE_SECURITY.md). The
> public-repository assumptions and pending actions below no longer describe
> the current release process.

## Scope and status

This review covers the public, user-owned `aliammari1/data-navigator` repository,
its Electron/Next.js app, local DuckDB/SQLite/Parquet data, LAN collaboration,
and the GitHub release path. It records observed boundaries and concrete controls;
it is not a claim that the application is free of vulnerabilities.

The release workflow now requires Security, OSV, CI, and Quality before versioning.
It creates a GitHub draft release, requires a GitHub-verified source commit and
signed tag, verifies pinned Linux GPG and Windows Authenticode identities, creates
build provenance attestations, checks every installer asset has an attestation,
and publishes only after those jobs succeed. Security checks that were advisory
(the production dependency audits and provenance creation) now fail the workflow.
Gitleaks' downloaded executable is checksum pinned, Semgrep's version is pinned,
and pnpm's exotic subdependency block is enabled. See
[`RELEASE_SECURITY.md`](../.github/RELEASE_SECURITY.md) for required credentials.
The pending patch Changeset resolves to `v1.0.8`, and the release workflow
rejects older versions. `v1.0.7` is a historical release outside these gates.
The present Windows job uses a self-signed PFX for direct distribution to a
known group. The release is downloadable by anyone because the repository is
public, but Windows will not trust this signature on unmanaged devices.
Recipients must verify the independently shared fingerprint before trusting
the certificate. A future general-public distribution will require a publicly
trusted issuer and may need an HSM or signing service rather than a PFX secret;
the thumbprint and Authenticode gates should remain.

The release path is **currently closed**. GitHub reports the repository as
public, making CodeQL and dependency review eligible under its
[availability rules](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning).
The Code Scanning API currently reports no analysis; the CodeQL job must run
successfully and check for open alerts. A dedicated release GPG key is now
registered on GitHub and its Actions secrets are configured. Windows
certificate secrets are configured for the known recipients, and the current
`main` commit is unsigned. Historical
`v1.0.7` remains as it was.

GitHub now reports an active `main` ruleset requiring signed commits, pull
requests, and all 13 CI/Quality/Security/OSV checks. Secret scanning with push
protection is enabled, a `v*` tag ruleset blocks updates and deletions, and
immutable releases are enabled. Local
workflow rules cannot prevent a repository administrator from manually
publishing a release or bypassing CI. The first governed release still needs a
complete hosted workflow run, including CodeQL and signed Windows installers.

These are GitHub settings, not local repository edits. [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[push protection](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/prevent-future-leaks/enable-push-protection),
and [release immutability](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
are the relevant server-side controls.

## Architecture and findings

| Area | Evidence and action | Remaining work |
| --- | --- | --- |
| Electron renderer to main process | Previously, any `file:` page or loopback port passed the origin helper and missing IPC sender metadata could pass. The main process now checks the current app origin, the main window's webContents, and its main frame; navigation rejects protocol-relative URLs. Tests cover these boundaries. This follows [Electron's IPC and navigation guidance](https://www.electronjs.org/docs/latest/tutorial/security). | Review every future IPC handler for data-specific authorization. Keep Electron current. |
| LAN collaboration | Both embedded and standalone servers previously exposed rooms, audit entries, filenames, and `inboxDir` through public discovery, with wildcard CORS. Discovery now retains connection data but omits private metadata. Audit and file listing require the full pairing code; wildcard CORS is restricted to discovery and the existing browser upload flow. Standalone guest polling no longer exposes a token or wildcard CORS. | Six-digit pairing codes remain susceptible to repeated guesses on an exposed LAN service; add a rate limit/temporary lockout and review LAN TLS or a trusted tunnel for hostile networks. |
| Offline and online modes | Offline mode now blocks model and Pyodide downloads, external link opening, and renderer requests to nonlocal network destinations. Switching to Offline aborts active downloads and shuts down the LAN hub/proxy. Online update checks and collaboration were already gated. | This is an application policy, not an OS firewall: a compromised Node dependency, plugin, or separate process may still open sockets. For a strict air gap, run behind OS/network egress controls and test with packet capture. |
| Online runtime downloads | Model downloads use allowlisted entries with pinned SHA-256 values. Pyodide 0.26.2 files now have pinned SHA-256 values, are checked before reuse, and are written to temporary files before atomic replacement. | The Pyodide hashes were recorded from the versioned CDN and should be cross-checked with the upstream release when upgrading. Review Pyodide's version and its dependency advisories before a release. |
| DuckDB SQL | A SQL comment between `read_text` and `(` bypassed the textual guard and read a private file in a real DuckDB test. Comments are now rejected before the guard. | The engine still starts with external access enabled. The current `allowed_directories` setting is ineffective as a complete read boundary in that mode. Stage imports and exports in managed directories, create a separate query connection/instance with `enable_external_access=false`, `allowed_directories` set before access, `allow_community_extensions=false`, and locked configuration. For genuinely untrusted SQL, isolate the engine in a lower-privilege process or OS sandbox. [DuckDB explicitly treats untrusted SQL as code](https://duckdb.org/docs/current/operations_manual/securing_duckdb/overview). |
| File IPC | The `PathAccessController` now resolves symlinks, rejects escapes and dangling links, and preserves new save targets. Real filesystem tests cover these cases. | A hostile same-user process can still race a path change between checking and opening it. File-descriptor-based operations would reduce that check/use gap. |
| Data at rest | Auth SQLite encryption remains opt-in (`DN_ENCRYPT_AUTH_DB`), but an explicitly enabled instance now fails closed when its key is missing or migration fails; the original plaintext database is preserved for recovery. DuckDB, collaboration SQLite, cache/spill files, exports, and Parquet may contain plaintext. | Define a product key-recovery policy first, then migrate stores with verified backup and rollback. DuckDB supports [AES-GCM database encryption](https://duckdb.org/2025/11/19/encryption-in-duckdb) and [encrypted Parquet](https://duckdb.org/docs/current/data/parquet/encryption); current DuckDB Parquet support uses one footer key for all columns. The [Parquet standard](https://parquet.apache.org/docs/file-format/data-pages/encryption/) also supports finer column keys, which should not be assumed available through DuckDB. Encryption does not replace access controls or protect data while the app is unlocked. |
| Supply chain | pnpm lockfile, production audit, OSV, Gitleaks, Semgrep, CodeQL, SBOM generation, signature verification, and build attestations are release prerequisites in the local workflow. | Pin every external action to a full commit SHA, checksum other downloaded tools, attach and attest the SBOM, and establish an independent public channel for the GPG fingerprint. GitHub [recommends SHA-pinned actions](https://docs.github.com/en/actions/reference/security/secure-use). Enable [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) after the draft publication flow is exercised. |

## Tool choices

- **Keep OSV and pnpm audit** for known vulnerable dependencies. They cover known
  advisories, not novel application flaws. Keep lockfile installation frozen.
- **Keep Gitleaks** for committed credentials and **Semgrep OSS** for source
  patterns. A scan passing is not proof of no secret or vulnerability. The
  ignored generated `public/workers/export.worker.js.map` produces two generic
  Gitleaks pattern hits in a raw local directory scan; CI scans committed content.
  Production worker builds disable source maps and Electron packaging excludes
  `*.map` files.
- **Run CodeQL for this public repository.** [GitHub's current rules](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning)
  allow it. The local release policy blocks until analysis and the open-alert
  check succeed. If visibility changes to private under a personal account,
  re-evaluate Code Security eligibility before expecting this gate to run.
- **Use native DuckDB and Parquet encryption after key design.** Adding another
  database or wrapper library does not by itself solve plaintext spill files,
  backups, exports, or key storage. Preserve compatibility and test migration on
  real user data copies before changing defaults.
- **Use GitHub artifact attestations and immutable releases** for verifiable
  provenance and published-asset integrity. A public key attached to the same
  release as its signatures needs an independent fingerprint to establish who
  signed it. [GitHub attestation guidance](https://docs.github.com/en/actions/concepts/security/artifact-attestations).

## Validation and limits

Local `actionlint`, TypeScript, unit/coverage suite, production dependency audit,
OSV lockfile scan, and the repository's static security audit have passed during
this review. These results do not validate Windows Authenticode signing, GitHub
CodeQL service availability, repository secrets, or final publication. The
workflow must run on GitHub with configured signing identities before a new
release can be called verified.
