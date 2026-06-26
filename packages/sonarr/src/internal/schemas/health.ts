import { Schema } from "effect"
import { optionalNullable } from "./optional.js"

/**
 * `GET /api/v3/health` — an active health-check message. `type` is the severity
 * (ok | notice | warning | error), kept as a string so a new value won't break
 * decoding. `id` is a non-meaningful sequential artifact, so it's optional.
 */
export const Health = Schema.Struct({
  id: Schema.optional(Schema.Number),
  source: optionalNullable(Schema.String),
  type: Schema.String,
  message: optionalNullable(Schema.String),
  wikiUrl: optionalNullable(Schema.String),
})

export type Health = Schema.Schema.Type<typeof Health>
