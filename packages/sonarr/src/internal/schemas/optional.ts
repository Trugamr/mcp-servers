import { Schema } from "effect"

/**
 * A field Sonarr may send as `null` or omit entirely. Sonarr (System.Text.Json)
 * serializes nullable reference types as present-with-`null`, so plain
 * `Schema.optional` — which only tolerates a missing key — would reject the
 * `null` and surface a `SonarrDecodeError`. Use this for any field whose presence
 * or non-nullness isn't guaranteed.
 */
export const optionalNullable = <A, I>(schema: Schema.Schema<A, I>) =>
  Schema.optionalWith(schema, { nullable: true })
