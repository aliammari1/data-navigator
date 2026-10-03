# Release security

The `Release` workflow is the only supported publication path. It runs CI,
Quality, the reusable Security suite, and the OSV lockfile scan before Changesets
can create a version tag. Windows and Linux packages are intentionally distributed
without publisher signatures.

No Windows code-signing certificate, PFX, private root, GPG release key, detached
package signature, or signed release tag is required by the release workflow.

Release integrity is still checked before publication:

- Windows and Linux packages must be produced by their gated workflow jobs.
- GitHub release asset SHA-256 digests are checked after download.
- Windows MSI and EXE hashes must match the exact Windows build job outputs.
- `release-provenance.json` records the release tag, source commit, Actions run,
  package names, sizes, and SHA-256 hashes.
- The final publication job re-downloads the draft assets and verifies the
  provenance manifest before publishing the release.

These checks detect corruption or unexpected artifact replacement, but they do
not provide publisher authentication. Windows may therefore report an unknown
publisher or show SmartScreen/application-control warnings. Do not instruct users
to install a private root certificate or weaken device security to bypass company
policy.

If a security scan, build, digest, or provenance check fails, the release stays
draft. Fix the cause through the normal pull-request workflow. Do not publish a
failed draft by hand.

Version tags remain protected against update and deletion. The `main` branch
continues to require its configured CI/security checks and repository-level commit
verification policy; those repository protections are separate from installer
signing.

The repository is intended for private, proprietary use. Keep production secrets
in GitHub Actions secrets or other approved secret stores, never in source,
release assets, workflow logs, or documentation.
