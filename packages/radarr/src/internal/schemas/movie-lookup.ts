import { optionalNullable } from "@trugamr/kit"
import { Schema } from "effect"

/**
 * One candidate from `GET /api/v3/movie/lookup?term=` — a metadata-provider search
 * for a movie to add. Lean: enough for an agent to pick the right title and hand its
 * `tmdbId` to an add. `Schema.Struct` drops the rest (images, ratings, …).
 *
 * `id` is present only when the movie is already in the library — it's that library
 * entry's Radarr id. Radarr omits it for a candidate that hasn't been added, so a
 * missing `id` means "not in the library yet".
 */
export const MovieLookup = Schema.Struct({
  tmdbId: Schema.Number,
  title: Schema.String,
  year: Schema.Number,
  id: Schema.optional(Schema.Number),
  titleSlug: optionalNullable(Schema.String),
  overview: optionalNullable(Schema.String),
  studio: optionalNullable(Schema.String),
  status: optionalNullable(Schema.String),
  imdbId: optionalNullable(Schema.String),
  runtime: Schema.optional(Schema.Number),
  genres: Schema.optional(Schema.Array(Schema.String)),
  hasFile: Schema.optional(Schema.Boolean),
  monitored: Schema.optional(Schema.Boolean),
})

export type MovieLookup = Schema.Schema.Type<typeof MovieLookup>
