import { Schema } from "effect"

/**
 * Radarr's quality model as it appears on releases and queue items. Lean: only the
 * inner `quality` descriptor (name/resolution/source) an agent reads to compare
 * candidates. `Schema.Struct` drops the `revision`/`modifier` details that aren't
 * needed yet. Codec (HEVC/x265) is NOT here — it lives only in a release's title.
 */
export const Quality = Schema.Struct({
  quality: Schema.Struct({
    id: Schema.optional(Schema.Number),
    name: Schema.String,
    resolution: Schema.optional(Schema.Number),
    source: Schema.optional(Schema.String),
  }),
})

export type Quality = Schema.Schema.Type<typeof Quality>
