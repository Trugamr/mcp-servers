import { optionalNullable } from "@trugamr/kit"
import { Schema } from "effect"
import { Quality } from "./quality.js"

/**
 * One candidate from `GET /api/v3/release?movieId=` — a live interactive indexer
 * search. Lean: enough for an agent to compare releases, plus the two keys (`guid`,
 * `indexerId`) it later hands to a grab. `Schema.Struct` drops the rest.
 *
 * Codec (HEVC/x265/h265) is NOT a structured field on Radarr — it appears only in
 * `title`. A caller filtering for "1080p hevc" reads `quality` for the resolution and
 * the `title` string for the codec. `seeders`/`leechers` are torrent-only and absent
 * for usenet. `size` is int64 bytes, modeled as a JS number (precise enough here).
 *
 * `downloadUrl` is intentionally NOT modeled: Radarr embeds an API key in it, and the
 * grab path keys off `guid` + `indexerId`, so surfacing it would leak that secret into
 * the caller's (and the agent's) context for no gain. `infoUrl` is a public details page.
 */
export const Release = Schema.Struct({
  guid: Schema.String,
  indexerId: Schema.Number,
  title: Schema.String,
  quality: Schema.optional(Quality),
  size: Schema.optional(Schema.Number),
  seeders: optionalNullable(Schema.Number),
  leechers: optionalNullable(Schema.Number),
  age: Schema.optional(Schema.Number),
  ageHours: Schema.optional(Schema.Number),
  indexer: optionalNullable(Schema.String),
  protocol: Schema.String, // torrent | usenet
  releaseGroup: optionalNullable(Schema.String),
  languages: Schema.optional(
    Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String })),
  ),
  customFormatScore: Schema.optional(Schema.Number),
  approved: Schema.optional(Schema.Boolean),
  rejected: Schema.optional(Schema.Boolean),
  temporarilyRejected: Schema.optional(Schema.Boolean),
  rejections: Schema.optional(Schema.Array(Schema.String)),
  downloadAllowed: Schema.optional(Schema.Boolean),
  publishDate: Schema.optional(Schema.String),
  infoUrl: optionalNullable(Schema.String),
})

export type Release = Schema.Schema.Type<typeof Release>
