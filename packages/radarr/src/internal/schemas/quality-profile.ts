import { Schema } from "effect"
import { optionalNullable } from "@trugamr/kit"

const Quality = Schema.Struct({
  id: Schema.Number,
  name: optionalNullable(Schema.String),
  source: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.Number),
})

/**
 * An entry in a profile's quality list. A plain quality carries `quality`; a
 * group nests its own `items` (not modeled here — `Schema.Struct` drops it).
 */
const QualityProfileItem = Schema.Struct({
  id: Schema.optional(Schema.Number),
  name: optionalNullable(Schema.String),
  allowed: Schema.Boolean,
  quality: Schema.optional(Quality),
})

/** `GET /api/v3/qualityprofile`. */
export const QualityProfile = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  upgradeAllowed: Schema.Boolean,
  cutoff: Schema.Number,
  minFormatScore: Schema.Number,
  cutoffFormatScore: Schema.Number,
  items: Schema.Array(QualityProfileItem),
})

export type QualityProfile = Schema.Schema.Type<typeof QualityProfile>
