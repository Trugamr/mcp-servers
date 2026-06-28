import { Context, type Effect, Layer } from "effect"
import { decodeConfig, type RadarrConfig, type RadarrConfigInput } from "./config.js"
import type { RadarrError } from "./errors.js"
import * as movie from "./movie.js"
import type { AddMovie, RemoveMovieOptions } from "./movie.js"
import * as qualityProfile from "./quality-profile.js"
import * as queue from "./queue.js"
import * as release from "./release.js"
import type { ReleaseGrab } from "./release.js"
import * as rootFolder from "./root-folder.js"
import type { Movie } from "./schemas/movie.js"
import type { MovieLookup } from "./schemas/movie-lookup.js"
import type { QualityProfile } from "./schemas/quality-profile.js"
import type { QueuePage } from "./schemas/queue.js"
import type { Release } from "./schemas/release.js"
import type { RootFolder } from "./schemas/root-folder.js"
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
    readonly lookup: (term: string) => Effect.Effect<ReadonlyArray<MovieLookup>, RadarrError>
    readonly add: (input: AddMovie) => Effect.Effect<Movie, RadarrError>
    readonly remove: (id: number, options?: RemoveMovieOptions) => Effect.Effect<void, RadarrError>
  }
  readonly release: {
    readonly search: (movieId: number) => Effect.Effect<ReadonlyArray<Release>, RadarrError>
    readonly grab: (body: ReleaseGrab) => Effect.Effect<void, RadarrError>
  }
  readonly queue: {
    readonly list: Effect.Effect<QueuePage, RadarrError>
  }
  readonly qualityProfile: {
    readonly list: Effect.Effect<ReadonlyArray<QualityProfile>, RadarrError>
  }
  readonly rootFolder: {
    readonly list: Effect.Effect<ReadonlyArray<RootFolder>, RadarrError>
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
    lookup: (term) => movie.lookup(config, term),
    add: (input) => movie.add(config, input),
    remove: (id, options) => movie.remove(config, id, options),
  },
  release: {
    search: (movieId) => release.search(config, movieId),
    grab: (body) => release.grab(config, body),
  },
  queue: {
    list: queue.list(config),
  },
  qualityProfile: {
    list: qualityProfile.list(config),
  },
  rootFolder: {
    list: rootFolder.list(config),
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
