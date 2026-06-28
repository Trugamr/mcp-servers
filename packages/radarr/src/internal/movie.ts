import { Effect, Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { del, getJson, provideTransport, sendJson } from "./http.js"
import { Movie } from "./schemas/movie.js"
import { MovieLookup } from "./schemas/movie-lookup.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/movie`

/** The fields an add layers onto a looked-up movie resource to place it in the library. */
export interface AddMovie {
  readonly tmdbId: number
  readonly qualityProfileId: number
  readonly rootFolderPath: string
  readonly monitored?: boolean | undefined
  readonly minimumAvailability?: string | undefined
}

/** Optional flags for a movie delete; both default to Radarr's own defaults (off). */
export interface RemoveMovieOptions {
  readonly deleteFiles?: boolean | undefined
  readonly addImportListExclusion?: boolean | undefined
}

/** `GET /api/v3/movie` — every movie in the library. */
export const list = (config: RadarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Movie), basePath))

/** `GET /api/v3/movie/{id}` — a single movie by its Radarr id. */
export const get = (config: RadarrConfig, id: number) =>
  provideTransport(getJson(config, Movie, `${basePath}/${id}`))

/**
 * `GET /api/v3/movie/lookup?term=` — search the metadata provider for a movie to
 * add (requires network access). Each candidate's `id` is its Radarr library id, or
 * `0` when it isn't in the library yet.
 */
export const lookup = (config: RadarrConfig, term: string) =>
  provideTransport(
    getJson(config, Schema.Array(MovieLookup), `${basePath}/lookup`, { urlParams: { term } }),
  )

/**
 * Add a movie to the library by its TMDB id. `POST /api/v3/movie` wants the full
 * looked-up resource (title, titleSlug, images, …), so this first fetches it from
 * `GET /api/v3/movie/lookup/tmdb?tmdbId=` — decoded permissively so no field is
 * dropped before the re-post — then posts it with the quality profile, root folder,
 * and add options applied. `searchForMovie` is false: the add never starts a release
 * search, so grabbing stays a separate, explicit step. Returns the created movie.
 */
export const add = (config: RadarrConfig, input: AddMovie) =>
  provideTransport(
    getJson(
      config,
      Schema.Record({ key: Schema.String, value: Schema.Unknown }),
      `${basePath}/lookup/tmdb`,
      { urlParams: { tmdbId: input.tmdbId } },
    ).pipe(
      Effect.flatMap((resource) =>
        sendJson(config, "post", Movie, basePath, {
          ...resource,
          qualityProfileId: input.qualityProfileId,
          rootFolderPath: input.rootFolderPath,
          monitored: input.monitored ?? true,
          minimumAvailability: input.minimumAvailability ?? "released",
          addOptions: { searchForMovie: false },
        }),
      ),
    ),
  )

/**
 * `DELETE /api/v3/movie/{id}` — remove a movie from the library. `deleteFiles` also
 * deletes its files on disk; `addImportListExclusion` keeps an import list from
 * re-adding it. Both default to Radarr's own defaults (off) when omitted.
 */
export const remove = (config: RadarrConfig, id: number, options?: RemoveMovieOptions) =>
  provideTransport(
    del(config, `${basePath}/${id}`, {
      urlParams: {
        deleteFiles: options?.deleteFiles,
        addImportListExclusion: options?.addImportListExclusion,
      },
    }),
  )
