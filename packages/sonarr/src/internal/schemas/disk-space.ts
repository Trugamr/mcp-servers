import { Schema } from "effect"
import { optionalNullable } from "@trugamr/kit"

/**
 * `GET /api/v3/diskspace` — free/total space for a Sonarr-visible mount.
 * `freeSpace`/`totalSpace` are int64 bytes, modeled as a JS number (precise enough
 * at this scale). `id` is a non-meaningful sequential artifact, so it's optional.
 */
export const DiskSpace = Schema.Struct({
  id: Schema.optional(Schema.Number),
  path: optionalNullable(Schema.String),
  label: optionalNullable(Schema.String),
  freeSpace: Schema.Number,
  totalSpace: Schema.Number,
})

export type DiskSpace = Schema.Schema.Type<typeof DiskSpace>
