import { Schema } from "effect"
import { optionalNullable } from "@trugamr/kit"
import { Language } from "./language.js"

const Quality = Schema.Struct({
  id: Schema.Number,
  name: optionalNullable(Schema.String),
  source: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.Number),
})

/** A single quality — the leaf of a profile's quality list and the member of a group. */
const QualityProfileGroupItem = Schema.Struct({
  id: Schema.optional(Schema.Number),
  name: optionalNullable(Schema.String),
  allowed: Schema.Boolean,
  quality: Schema.optional(Quality),
})

/**
 * An entry in a profile's quality list — a single quality (carries `quality`) or a
 * named group that nests its own qualities under `items`. Radarr groups hold individual
 * qualities and don't nest further, so one level is modeled.
 */
const QualityProfileItem = Schema.Struct({
  ...QualityProfileGroupItem.fields,
  items: Schema.optional(Schema.Array(QualityProfileGroupItem)),
})

/**
 * A custom-format scoring rule on a profile: `format` is the custom format's id (from
 * `GET /customformat`), `score` the points a release earns when it matches.
 */
const ProfileFormatItem = Schema.Struct({
  id: Schema.optional(Schema.Number),
  format: Schema.Number,
  name: optionalNullable(Schema.String),
  score: Schema.Number,
})

/**
 * The writable shape of a quality profile — everything but the server-assigned `id`.
 * `POST /api/v3/qualityprofile` wants the full body; there is no schema endpoint, so a
 * create is built by cloning an existing profile (the `id`-bearing {@link QualityProfile})
 * and adjusting it. `cutoff` references an allowed item's id; `language` and
 * `formatItems[].format` reference ids from `GET /language` / `GET /customformat`.
 */
export const QualityProfileInput = Schema.Struct({
  name: Schema.String,
  upgradeAllowed: Schema.Boolean,
  cutoff: Schema.Number,
  minFormatScore: Schema.Number,
  cutoffFormatScore: Schema.Number,
  minUpgradeFormatScore: Schema.optional(Schema.Number),
  items: Schema.Array(QualityProfileItem),
  formatItems: Schema.optional(Schema.Array(ProfileFormatItem)),
  language: Schema.optional(Language),
})

export type QualityProfileInput = Schema.Schema.Type<typeof QualityProfileInput>

/** A partial profile for updates: every writable field optional, the rest left as-is. */
export const QualityProfilePatch = Schema.partial(QualityProfileInput)

export type QualityProfilePatch = Schema.Schema.Type<typeof QualityProfilePatch>

/** `GET /api/v3/qualityprofile` (array) and `GET /api/v3/qualityprofile/{id}`. */
export const QualityProfile = Schema.Struct({
  id: Schema.Number,
  ...QualityProfileInput.fields,
})

export type QualityProfile = Schema.Schema.Type<typeof QualityProfile>
