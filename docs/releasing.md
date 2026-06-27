# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets). You never edit versions or create tags by hand — you describe intent in a changeset, and merging the generated "Version Packages" PR cuts the release.

## What gets released

- `@trugamr/sonarr` and `@trugamr/sonarr-mcp` are versioned independently, from a `0.0.0` baseline.
- `@trugamr/testkit` is private and source-only, so it is never versioned, tagged, or published — enforced by `privatePackages` in [`.changeset/config.json`](../.changeset/config.json).
- Every `@trugamr/sonarr-mcp` release also publishes a version-matched container image to GHCR.

## Adding a changeset

When a PR changes a published package, add a changeset and commit it alongside the code:

```sh
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a one-line summary — it becomes the changelog entry. PRs that touch only private packages, docs, or CI don't need one.

## The release flow

1. **Merge a PR carrying changesets to `main`.** `release.yml` opens (or updates) a **"Version Packages"** PR that applies every pending changeset: it bumps versions, writes each package's `CHANGELOG.md`, and deletes the consumed changeset files.
2. **Merge the "Version Packages" PR when you're ready to ship.** That merge tags the release (`@trugamr/sonarr@x.y.z`, `@trugamr/sonarr-mcp@x.y.z`), creates GitHub Releases from the changelog, and — in the same workflow run — builds and pushes the matching image.

Sit on the Version Packages PR to batch several merges into one release; merge it to ship.

## Container image tags

`docker-publish.yml` publishes `ghcr.io/trugamr/sonarr-mcp`:

| Tag       | When                 | Tracks                     |
| --------- | -------------------- | -------------------------- |
| `:edge`   | every push to `main` | latest unreleased build    |
| `:x.y.z`  | a release            | that exact version         |
| `:x.y`    | a release            | latest patch of that minor |
| `:latest` | a release            | newest release             |

The versioned build runs inside the release run (via a reusable `workflow_call`), so it needs no personal access token — only the built-in `GITHUB_TOKEN`.

## One-time repository setup

The "Version Packages" PR is opened by Actions using `GITHUB_TOKEN`, which requires **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** to be **enabled**. Without it, `release.yml` fails with _"GitHub Actions is not permitted to create or approve pull requests."_ The per-job `contents: write` / `packages: write` permissions are granted in the workflows themselves, so the repository default can stay read-only.

## npm publishing

Not enabled yet — packages ship as git tags plus GHCR images for now. Turning on npm is additive: switch the `release` script from `changeset tag` to `turbo run build && changeset publish`, and add npm OIDC trusted publishing (`id-token: write` + `--provenance`). `access: public` is already set in the Changesets config.
