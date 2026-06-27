# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It is how releases are versioned and changelogged.

## Adding a changeset

When a PR changes a published package (`@trugamr/sonarr`, `@trugamr/sonarr-mcp`), run:

```bash
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a short summary. Commit the generated `.changeset/*.md` file with your PR. The summary becomes the changelog entry.

`@trugamr/testkit` is private and source-only — it is never versioned or published, so it never needs a changeset.

## Releasing

On merge to `main`, the release workflow opens a **"Version Packages"** PR that applies the pending changesets (bumps versions, writes `CHANGELOG.md`, deletes the consumed files). Merging that PR tags the release and publishes the versioned container image. You never bump versions or tag by hand.
