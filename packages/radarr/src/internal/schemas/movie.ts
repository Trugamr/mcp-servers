import { optionalNullable } from "@trugamr/kit"
import { Schema } from "effect"

/**
 * `GET /api/v3/movie` (array) and `GET /api/v3/movie/{id}`. Lean: only the fields
 * an agent needs to identify and reason about a movie. `Schema.Struct` drops
 * unmodeled keys, keeping the SDK forward-compatible as the payload grows.
 *
 * Movie is Radarr's flat primary resource — there is no season/episode hierarchy.
 * The external identity is `tmdbId` (TMDB), not Sonarr's `tvdbId`. `ratings` is
 * deliberately not modeled: Radarr nests it per provider (`imdb`/`tmdb`/…), unlike
 * Sonarr's flat shape, and it isn't needed yet — Struct silently strips it.
 * `sizeOnDisk` is int64 bytes, modeled as a JS number (precise enough at this scale).
 */
export const Movie = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  sortTitle: optionalNullable(Schema.String),
  status: Schema.String, // announced | inCinemas | released | deleted
  overview: optionalNullable(Schema.String),
  year: Schema.Number,
  runtime: Schema.Number,
  hasFile: Schema.Boolean,
  monitored: Schema.Boolean,
  minimumAvailability: optionalNullable(Schema.String), // announced | inCinemas | released
  isAvailable: Schema.optional(Schema.Boolean),
  qualityProfileId: Schema.Number,
  path: optionalNullable(Schema.String),
  titleSlug: Schema.String,
  studio: optionalNullable(Schema.String),
  certification: optionalNullable(Schema.String),
  genres: Schema.optional(Schema.Array(Schema.String)),
  tags: Schema.Array(Schema.Number),
  added: Schema.String,
  tmdbId: Schema.Number,
  imdbId: optionalNullable(Schema.String),
  sizeOnDisk: Schema.optional(Schema.Number),
})

export type Movie = Schema.Schema.Type<typeof Movie>
