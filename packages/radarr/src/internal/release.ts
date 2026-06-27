import { Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport, sendJsonVoid } from "./http.js"
import { Release } from "./schemas/release.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/release`

/** The keys identifying a release to grab, taken from a prior `search` result. */
export interface ReleaseGrab {
  readonly guid: string
  readonly indexerId: number
}

/**
 * `GET /api/v3/release?movieId={id}` — run an interactive indexer search for a movie
 * already in the library, returning the candidate releases. Empty when no indexers
 * are configured (or none have results). Slow: this hits external indexers live.
 */
export const search = (config: RadarrConfig, movieId: number) =>
  provideTransport(getJson(config, Schema.Array(Release), basePath, { urlParams: { movieId } }))

/**
 * `POST /api/v3/release` — grab a release (identified by `guid` + `indexerId` from a
 * prior `search`) and hand it to the download client. Radarr returns no body to rely
 * on, so this resolves to void; the download then appears in `GET /api/v3/queue`.
 */
export const grab = (config: RadarrConfig, body: ReleaseGrab) =>
  provideTransport(sendJsonVoid(config, "post", basePath, body))
