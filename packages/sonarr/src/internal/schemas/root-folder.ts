import { Schema } from "effect"
import { optionalNullable } from "./optional.js"

/**
 * `GET /api/v3/rootfolder` and the body returned by `POST /api/v3/rootfolder`.
 * `freeSpace` is int64 bytes, modeled as a JS number (precise enough at this scale).
 */
export const RootFolder = Schema.Struct({
  id: Schema.Number,
  path: optionalNullable(Schema.String),
  accessible: Schema.Boolean,
  freeSpace: optionalNullable(Schema.Number),
})

export type RootFolder = Schema.Schema.Type<typeof RootFolder>
