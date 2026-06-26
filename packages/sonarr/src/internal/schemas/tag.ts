import { Schema } from "effect"

/** `GET /api/v3/tag` and the body returned by `POST /api/v3/tag`. */
export const Tag = Schema.Struct({
  id: Schema.Number,
  label: Schema.String,
})

export type Tag = Schema.Schema.Type<typeof Tag>
