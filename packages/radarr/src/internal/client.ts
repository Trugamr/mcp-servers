import { Context, type Effect, Layer } from "effect"
import { decodeConfig, type RadarrConfig, type RadarrConfigInput } from "./config.js"
import type { RadarrError } from "./errors.js"
import * as movie from "./movie.js"
import type { Movie } from "./schemas/movie.js"
import type { SystemStatus } from "./schemas/system-status.js"
import { getStatus } from "./system.js"

/** The Radarr v3 API surface — operations grouped by resource. */
export interface RadarrV3Api {
  readonly system: {
    readonly getStatus: Effect.Effect<SystemStatus, RadarrError>
  }
  readonly movie: {
    readonly list: Effect.Effect<ReadonlyArray<Movie>, RadarrError>
    readonly get: (id: number) => Effect.Effect<Movie, RadarrError>
  }
}

/**
 * The Radarr client for Effect consumers. The flat members mirror the latest API
 * version (v3 today) — the surface the MCP server rides; each version is also
 * pinnable by name (`.v3`), so a future version is additive, not a breaking move.
 */
export interface RadarrService extends RadarrV3Api {
  readonly v3: RadarrV3Api
}

const makeV3 = (config: RadarrConfig): RadarrV3Api => ({
  system: {
    getStatus: getStatus(config),
  },
  movie: {
    list: movie.list(config),
    get: (id) => movie.get(config, id),
  },
})

const make = (config: RadarrConfig): RadarrService => {
  const v3 = makeV3(config)
  const latest = v3 // the one place "latest" is defined; the flat members mirror it
  return { ...latest, v3 }
}

/**
 * The Radarr client as an Effect service. Provide `Radarr.layer(config)` once, then
 * read the client from context with `yield* Radarr` — the idiomatic alternative to
 * threading config through every call.
 */
export class Radarr extends Context.Tag("@trugamr/radarr/Radarr")<Radarr, RadarrService>() {
  static readonly layer = (config: RadarrConfigInput): Layer.Layer<Radarr> =>
    Layer.sync(Radarr, () => make(decodeConfig(config)))
}
