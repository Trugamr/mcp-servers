import { Schema } from "effect"
import { optionalNullable } from "@trugamr/kit"

const SeasonStatistics = Schema.Struct({
  episodeFileCount: Schema.Number,
  episodeCount: Schema.Number,
  totalEpisodeCount: Schema.Number,
  sizeOnDisk: Schema.Number,
  percentOfEpisodes: Schema.Number,
  nextAiring: optionalNullable(Schema.String),
  previousAiring: optionalNullable(Schema.String),
})

const Season = Schema.Struct({
  seasonNumber: Schema.Number,
  monitored: Schema.Boolean,
  statistics: Schema.optional(SeasonStatistics),
})

const SeriesStatistics = Schema.Struct({
  seasonCount: Schema.Number,
  episodeFileCount: Schema.Number,
  episodeCount: Schema.Number,
  totalEpisodeCount: Schema.Number,
  sizeOnDisk: Schema.Number,
  percentOfEpisodes: Schema.Number,
})

/**
 * `GET /api/v3/series` (array) and `GET /api/v3/series/{id}`. Lean: only the
 * fields an agent needs to identify and reason about a series. `Schema.Struct`
 * drops unmodeled keys, keeping the SDK forward-compatible as the payload grows.
 * `sizeOnDisk` is int64 bytes, modeled as a JS number (precise enough at this scale).
 */
export const Series = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  sortTitle: optionalNullable(Schema.String),
  status: Schema.String, // continuing | ended | upcoming | deleted
  ended: Schema.Boolean,
  overview: optionalNullable(Schema.String),
  network: optionalNullable(Schema.String),
  airTime: optionalNullable(Schema.String),
  year: Schema.Number,
  path: optionalNullable(Schema.String),
  qualityProfileId: Schema.Number,
  seasonFolder: Schema.Boolean,
  monitored: Schema.Boolean,
  runtime: Schema.Number,
  tvdbId: Schema.Number,
  imdbId: optionalNullable(Schema.String),
  titleSlug: Schema.String,
  seriesType: Schema.String, // standard | daily | anime
  genres: Schema.optional(Schema.Array(Schema.String)),
  tags: Schema.Array(Schema.Number),
  added: Schema.String,
  firstAired: optionalNullable(Schema.String),
  lastAired: optionalNullable(Schema.String),
  ratings: Schema.optional(Schema.Struct({ votes: Schema.Number, value: Schema.Number })),
  statistics: Schema.optional(SeriesStatistics),
  seasons: Schema.Array(Season),
})

export type Series = Schema.Schema.Type<typeof Series>
