import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Episode } from "./schemas/episode.js"

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
    getJson(config, Schema.Array(Episode), "/api/v3/episode", {
      urlParams: { seriesId: params.seriesId, seasonNumber: params.seasonNumber },
    }),
  )
