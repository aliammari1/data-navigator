# Release security gates (v1.0.8 onward)

The `Release` workflow is the only supported publication path. It runs CI,
Quality, the reusable Security suite (production dependency audit, full security
audit, Gitleaks, and Semgrep), and the OSV lockfile scan before Changesets can
create a version tag. A draft release receives Windows and Linux
packages. The final job publishes it only after both builds verify signatures,
the Windows draft installers match the hashes from their verified build job, and all four
packages match a GPG-signed release provenance manifest.

Configure these repository Actions secrets before the next release:

- `GPG_PRIVATE_KEY`: armored private key for a dedicated release signing identity.
- `GPG_SIGNING_FINGERPRINT`: full fingerprint of that key, also registered as a
  public GPG key on the GitHub account that owns the signing email.
- `GPG_SIGNING_EMAIL`: verified email address associated with the GPG key.
- `WINDOWS_CERTIFICATE_BASE64`: base64 encoding of a valid Windows code signing
  PFX certificate, including its private key.
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX password.
- `WINDOWS_CERTIFICATE_THUMBPRINT`: full certificate thumbprint.

The current Windows job uses a code-signing leaf issued by a private root for
direct distribution to a known group. The root public certificate is committed
at `.github/certs/data-navigator-signing-root.cer`, with SHA-256 fingerprint
`7237D443A8D69F6146A95FEE4B4CEF8ADB50801457226FB8501CB634C80BD138`.
The leaf Authenticode thumbprint is
`1956F63398744EF3D2A88348371753B60A3F1390`. The job pins both identities,
validates the PFX chain, and then validates MSI and EXE signatures. Recipients
must verify the root fingerprint with the publisher through a separate channel
before trusting it on their PCs. The repository is private, and this root is
not publicly trusted by Windows.
Before general public Windows
distribution, integrate a trusted CA/HSM or signing service and retain the
Authenticode and fingerprint gates.

The source commit also needs a GitHub-verified signature. The workflow creates a
signed annotated tag, then checks GitHub's verification result. Linux packages
must have valid GPG signatures from the pinned key. The MSI and EXE must have
valid Authenticode signatures from the pinned certificate. The Linux public key
and fingerprint are attached to the draft release for independent verification.
The final job signs the Windows installers and `release-provenance.json` with the
pinned GPG key. That manifest binds the four package hashes to the tag, source
commit, repository, and Actions run. GitHub-hosted artifact attestations are
unavailable for this user-owned private repository, so these publisher GPG
signatures are the supported integrity and provenance mechanism.

If a scan, signature, fingerprint, manifest check, or build fails, the release
stays draft. Fix the cause and rerun failed jobs when the tagged workflow already
contains the fix; otherwise create the next patch version, because protected
version tags cannot be changed. Do not publish a failed draft by hand. The
previously published `v1.0.7` release predates these gates. The release workflow
rejects a release version earlier than `v1.0.8`. Protected `v1.0.8` and
`v1.0.9` tags belong to failed draft releases.

The repository is private and proprietary under a personal GitHub account.
GitHub CodeQL/code scanning and the dependency-review action require GitHub
Code Security for private repositories, which is available to eligible
organization-owned repositories rather than this personal repository. The
workflow does not claim those unavailable checks passed. GitHub Secret
Protection is also unavailable for this ownership and visibility; Gitleaks
scans commits in CI. Required private-repo
gates are Semgrep SAST, OSV lockfile scanning, the pnpm audits, Gitleaks, and
the CI security audit. Dependabot alerts and automated security updates are
enabled separately. The source commit and tag must have GitHub-verified
signatures.

The dedicated release GPG key is registered on GitHub and its Actions secrets
are configured. Its public fingerprint is
`BAD14B8D11A5A8751BC71FABEDD42B597D58CCEB`. Publish this fingerprint
through an independently trusted channel before asking users to trust its
identity. Windows certificate secrets are configured for the known recipients.
The release notes explain its trust requirements, and the certificate is
attached as a release asset. A publicly trusted certificate is required before
general public Windows distribution.

GitHub secret scanning with push protection, a `v*` tag ruleset that blocks
tag updates and deletion, a `main` ruleset requiring signed commits,
pull requests, and all 13 CI/Quality/Security/OSV checks, and immutable
releases are active. A workflow alone
cannot prevent manual publication by a repository administrator.
