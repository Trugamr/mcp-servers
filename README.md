# mcp-servers

A library-first monorepo wrapping daily-use apps (Sonarr, the rest of the \*arr stack, and others later) so AI agents — and I — can drive them. Each app is a clean, typed, side-effect-free SDK; CLI and MCP adapters are thin layers over it.

- **npm scope:** `@trugamr/*`
- **Engine:** Node `24.x` (LTS) + pnpm `10.x`, resolved by [proto](https://moonrepo.dev/proto) from `package.json` (`engines.node` + `packageManager`)
- **Toolchain:** `tsgo` (typecheck), `oxlint` (lint), `oxfmt` (format), `tsdown` (build), `vitest` + `msw` (unit tests), `testcontainers` (integration tests)
- **Core:** every SDK is built on [Effect](https://effect.website) internally, but the default export is Promise-based and never surfaces Effect. Effect users opt in via the `/effect` subpath (e.g. `@trugamr/sonarr/effect`).

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
- **Integration (`pnpm test:integration`)** — drives the SDK against a **real, throwaway Sonarr**. A Vitest global setup boots a Sonarr container via Testcontainers, so the only requirement is a running **Docker** daemon. The same command runs locally and in CI (a dedicated `integration` job).

To run integration tests against an instance you already have — skipping the container — set both env vars:

```sh
SONARR_BASE_URL=http://localhost:8989 SONARR_API_KEY=... pnpm test:integration
```

## Usage

```ts
import { Sonarr } from "@trugamr/sonarr"

const sonarr = new Sonarr({ baseUrl: "http://localhost:8989", apiKey: "..." })
const status = await sonarr.system.getStatus()
console.log(status.version)
```
