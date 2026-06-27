import { Schema } from "effect"
import { optionalNullable } from "@trugamr/kit"

/**
 * `GET /api/v3/episode?seriesId=`. Lean episode view; `Schema.Struct` drops
 * unmodeled keys (e.g. the optional embedded `series`/`episodeFile`) for
 * forward-compatibility.
 */
export const Episode = Schema.Struct({
  id: Schema.Number,
  seriesId: Schema.Number,
  tvdbId: Schema.optional(Schema.Number),
  episodeFileId: Schema.Number,
  seasonNumber: Schema.Number,
  episodeNumber: Schema.Number,
  title: optionalNullable(Schema.String),
  airDate: optionalNullable(Schema.String),
  airDateUtc: optionalNullable(Schema.String),
  overview: optionalNullable(Schema.String),
  runtime: Schema.optional(Schema.Number),
  hasFile: Schema.Boolean,
  monitored: Schema.Boolean,
  absoluteEpisodeNumber: Schema.optional(Schema.Number),
})

export type Episode = Schema.Schema.Type<typeof Episode>
