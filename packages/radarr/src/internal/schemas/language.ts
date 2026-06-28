import { Schema } from "effect"
import { optionalNullable } from "@trugamr/kit"

/**
 * `GET /api/v3/language` — a language Radarr can tag a release with and a quality
 * profile can prefer. The list is fixed by Radarr (read-only); `id` is the handle a
 * profile's `language` field references.
 */
export const Language = Schema.Struct({
  id: Schema.Number,
  name: optionalNullable(Schema.String),
})

export type Language = Schema.Schema.Type<typeof Language>
