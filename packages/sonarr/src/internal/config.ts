import { ApiKey, BaseUrl } from "@trugamr/kit"
import { Schema } from "effect"

export const SonarrConfig = Schema.Struct({
  // Absolute http(s); trailing slashes stripped during decode so joined request
  // paths never double up. See `@trugamr/kit`.
  baseUrl: BaseUrl,
  // Stored as `Redacted` so the key prints as `<redacted>` in logs, errors, and
  // `JSON.stringify`. Input stays a plain string; unwrapped only at the request
  // boundary. See `@trugamr/kit`.
  apiKey: ApiKey,
})

export type SonarrConfig = Schema.Schema.Type<typeof SonarrConfig>
export type SonarrConfigInput = Schema.Schema.Encoded<typeof SonarrConfig>

/** Validate raw config; `baseUrl` normalization happens in the schema. */
export const decodeConfig: (input: SonarrConfigInput) => SonarrConfig =
  Schema.decodeUnknownSync(SonarrConfig)
