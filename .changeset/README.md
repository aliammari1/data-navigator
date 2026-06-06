# Changesets

Changesets record user-visible changes before they are collected into an
application release.

## Add a release note

Run:

```bash
pnpm changeset
```

Select `data-navigator`, choose the SemVer impact, and write a concise
user-facing summary:

- `patch`: fixes and compatible improvements
- `minor`: new backward-compatible functionality
- `major`: breaking behavior or migration requirements

Commit the generated Markdown file with the code change. Internal maintenance
that does not affect the shipped application does not require a changeset.

## Release flow

1. Changesets accumulate on `main`.
2. `.github/workflows/release.yml` creates or updates the release pull request.
3. The release pull request updates `package.json`, `pnpm-lock.yaml`, and
   `CHANGELOG.md`.
4. Merging the release pull request creates a `data-navigator@x.y.z` Git tag
   and a GitHub Release.

This package is private. The release workflow versions and tags the application
but never publishes it to npm.
