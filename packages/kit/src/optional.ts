import { Schema } from "effect"

/**
 * A field a Servarr app may send as `null` or omit entirely. Servarr
 * (System.Text.Json) serializes nullable reference types as present-with-`null`,
 * so plain `Schema.optional` — which only tolerates a missing key — would reject
 * the `null` and surface a decode error. Use this for any field whose presence or
 * non-nullness isn't guaranteed.
 */
export const optionalNullable = <A, I>(schema: Schema.Schema<A, I>) =>
  Schema.optionalWith(schema, { nullable: true })
