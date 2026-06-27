# mcp-servers

A library-first monorepo wrapping daily-use apps (Sonarr, the rest of the \*arr stack, and others later) so AI agents — and I — can drive them. Each app is a clean, typed, side-effect-free SDK; CLI and MCP adapters are thin layers over it.

- **npm scope:** `@trugamr/*`
- **Engine:** Node `24.x` (LTS) + pnpm `10.x`, resolved by [proto](https://moonrepo.dev/proto) from `package.json` (`engines.node` + `packageManager`)
- **Toolchain:** `tsgo` (typecheck), `oxlint` (lint), `oxfmt` (format), `tsdown` (build), `vitest` + `msw` (unit tests), `testcontainers` (integration tests)
- **Core:** every SDK is built on [Effect](https://effect.website). The published entry is the Effect surface on the `/effect` subpath (e.g. `@trugamr/sonarr/effect`); the bare `@trugamr/sonarr` entry is reserved for a Promise surface layered over it later.

## Packages

| Package                                | Description          |
| -------------------------------------- | -------------------- |
| [`@trugamr/sonarr`](./packages/sonarr) | Typed Sonarr API SDK |

## Getting started

```sh
proto use        # install pinned Node + pnpm
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Testing

Two suites:

- **Unit (`pnpm test`)** — the default. Every Sonarr HTTP call is mocked with `msw`; fast and needs nothing external.
- **Integration (`pnpm test:integration`)** — drives the SDK _and_ the MCP server against a **real, throwaway Sonarr**. A Vitest global setup boots a Sonarr container via Testcontainers (shared scaffolding lives in the internal, source-only `@trugamr/testkit`), so it needs a running **Docker** daemon — plus **network access** to Sonarr's metadata service, since the SDK's series/episode tests seed a real show so those reads decode populated payloads instead of empty arrays. The MCP suite drives tools over the Streamable HTTP transport end-to-end (one pipe per shape — a GET, a list, a write round-trip, a typed error). The same command runs both suites locally and in CI (a dedicated `integration` job).

To run integration tests against an instance you already have — skipping the container — set both env vars:

```sh
SONARR_BASE_URL=http://localhost:8989 SONARR_API_KEY=... pnpm test:integration
```

## Usage

Build the client layer with `Sonarr.layer(config)`, provide it once, then read the client from context and compose operations natively:

```ts
import { Sonarr } from "@trugamr/sonarr/effect"
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const sonarr = yield* Sonarr
  const status = yield* sonarr.system.getStatus
  console.log(status.version)
})

program.pipe(
  Effect.provide(Sonarr.layer({ baseUrl: "http://localhost:8989", apiKey: "..." })),
  Effect.runPromise,
)
```

## Releasing

Versioning and publishing are automated with [Changesets](https://github.com/changesets/changesets): add a changeset to your PR (`pnpm changeset`), and merging the generated "Version Packages" PR tags the release and publishes a version-matched `ghcr.io/trugamr/sonarr-mcp` image. See [docs/releasing.md](./docs/releasing.md).
