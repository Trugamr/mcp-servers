# mcp-servers

A library-first monorepo wrapping daily-use apps (Sonarr, the rest of the \*arr stack, and others later) so AI agents — and I — can drive them. Each app is a clean, typed, side-effect-free SDK; CLI and MCP adapters are thin layers over it.

- **npm scope:** `@trugamr/*`
- **Engine:** Node `24.x` (LTS) + pnpm `10.x`, resolved by [proto](https://moonrepo.dev/proto) from `package.json` (`engines.node` + `packageManager`)
- **Toolchain:** `tsgo` (typecheck), `oxlint` (lint), `oxfmt` (format), `tsdown` (build), `vitest` + `msw` (test)
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

## Usage

```ts
import { Sonarr } from "@trugamr/sonarr"

const sonarr = new Sonarr({ baseUrl: "http://localhost:8989", apiKey: "..." })
const status = await sonarr.system.getStatus()
console.log(status.version)
```
