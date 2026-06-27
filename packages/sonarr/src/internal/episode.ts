import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Episode } from "./schemas/episode.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/episode`

// `episode.list` takes params, so it's wired as a function and called per request;
// build the array schema once here rather than on every call.
const EpisodeArray = Schema.Array(Episode)

export interface EpisodeListParams {
  readonly seriesId: number
  readonly seasonNumber?: number | undefined
}

/**
 * `GET /api/v3/episode?seriesId=&seasonNumber=` — episodes for a series,
 * optionally narrowed to one season. `seriesId` is required by Sonarr; an
 * omitted `seasonNumber` is dropped from the query string.
 */
export const list = (config: SonarrConfig, params: EpisodeListParams) =>
  provideTransport(
    getJson(config, EpisodeArray, basePath, {
      urlParams: { seriesId: params.seriesId, seasonNumber: params.seasonNumber },
    }),
  )
