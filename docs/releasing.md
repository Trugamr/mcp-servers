# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets). You never edit versions or create tags by hand — you describe intent in a changeset, and merging the generated "Version Packages" PR cuts the release.

## What gets released

- `@trugamr/sonarr`, `@trugamr/radarr`, `@trugamr/sonarr-mcp`, and `@trugamr/radarr-mcp` are versioned independently from a `0.0.0` baseline and published to npm.
- `@trugamr/kit` and `@trugamr/testkit` are private and source-only: `kit` is inlined into the SDKs at build time, `testkit` is test-only, so neither is versioned, tagged, or published — enforced by `private: true` plus `privatePackages` in [`.changeset/config.json`](../.changeset/config.json).
- Each MCP server release also publishes a version-matched container image to GHCR (`ghcr.io/trugamr/sonarr-mcp`, `ghcr.io/trugamr/radarr-mcp`).

## Adding a changeset

When a PR changes a published package, add a changeset and commit it alongside the code:

```sh
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a one-line summary — it becomes the changelog entry. PRs that touch only private packages, docs, or CI don't need one.

## The release flow

1. **Merge a PR carrying changesets to `main`.** `release.yml` opens (or updates) a **"Version Packages"** PR that applies every pending changeset: it bumps versions, writes each package's `CHANGELOG.md`, and deletes the consumed changeset files.
2. **Merge the "Version Packages" PR when you're ready to ship.** That merge builds the packages, publishes them to npm, tags the release (`@trugamr/sonarr@x.y.z`, `@trugamr/radarr@x.y.z`, `@trugamr/sonarr-mcp@x.y.z`, `@trugamr/radarr-mcp@x.y.z`), creates GitHub Releases from the changelog, and — in the same workflow run — builds and pushes each MCP server's image.

Sit on the Version Packages PR to batch several merges into one release; merge it to ship.

## Container image tags

`docker-publish.yml` builds one MCP server image (`ghcr.io/trugamr/sonarr-mcp` or `ghcr.io/trugamr/radarr-mcp`); `release.yml` calls it once per server via a matrix, so each image versions independently with the same tag scheme:

| Tag       | When                 | Tracks                     |
| --------- | -------------------- | -------------------------- |
| `:edge`   | every push to `main` | latest unreleased build    |
| `:x.y.z`  | a release            | that exact version         |
| `:x.y`    | a release            | latest patch of that minor |
| `:latest` | a release            | newest release             |

Each build runs inside the release run (via a reusable `workflow_call`), so it needs no personal access token — only the built-in `GITHUB_TOKEN`. Adding a third containerized server is a new entry in the `matrix` step of `release.yml`.

## npm publishing

`changeset publish` publishes the public packages to npm on each release, authenticated with an `NPM_TOKEN` automation token (see setup below). Packages publish as public — `access: public` in the Changesets config, plus `publishConfig.access` on each package.

Provenance attestations and OIDC "trusted publishing" (secretless — no `NPM_TOKEN`) both require a **public** source repository; revisit those once this repo is public.

## One-time repository setup

- **Allow Actions to open PRs.** The "Version Packages" PR is opened by Actions using `GITHUB_TOKEN`, which requires **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** to be **enabled**. Without it, `release.yml` fails with _"GitHub Actions is not permitted to create or approve pull requests."_
- **npm token.** Add an `NPM_TOKEN` repository secret — a granular npm automation token with publish access to the `@trugamr` scope. `release.yml` exposes it to `changeset publish` as `NODE_AUTH_TOKEN`.

The per-job `contents: write` / `packages: write` permissions are granted in the workflows themselves, so the repository default can stay read-only.
