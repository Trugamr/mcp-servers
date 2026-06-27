import { ApiKey, BaseUrl } from "@trugamr/kit"
import { Schema } from "effect"

export const RadarrConfig = Schema.Struct({
  // Absolute http(s); trailing slashes stripped during decode so joined request
  // paths never double up. See `@trugamr/kit`.
  baseUrl: BaseUrl,
  // Stored as `Redacted` so the key prints as `<redacted>` in logs, errors, and
  // `JSON.stringify`. Input stays a plain string; unwrapped only at the request
  // boundary. See `@trugamr/kit`.
  apiKey: ApiKey,
})

export type RadarrConfig = Schema.Schema.Type<typeof RadarrConfig>
export type RadarrConfigInput = Schema.Schema.Encoded<typeof RadarrConfig>

/** Validate raw config; `baseUrl` normalization happens in the schema. */
export const decodeConfig: (input: RadarrConfigInput) => RadarrConfig =
  Schema.decodeUnknownSync(RadarrConfig)
