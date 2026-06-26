import { Schema } from "effect"

/**
 * `baseUrl` must be absolute http(s); its trailing slashes are stripped during
 * decode so joined request paths never produce a double slash.
 */
const BaseUrl = Schema.transform(
  Schema.String.pipe(Schema.pattern(/^https?:\/\//)),
  Schema.String,
  {
    strict: true,
    decode: (url) => url.replace(/\/+$/, ""),
    encode: (url) => url,
  },
)

export const SonarrConfig = Schema.Struct({
  baseUrl: BaseUrl,
  apiKey: Schema.String.pipe(Schema.minLength(1)),
})

export type SonarrConfig = Schema.Schema.Type<typeof SonarrConfig>
export type SonarrConfigInput = Schema.Schema.Encoded<typeof SonarrConfig>

/** Validate raw config; `baseUrl` normalization happens in the schema. */
export const decodeConfig: (input: SonarrConfigInput) => SonarrConfig =
  Schema.decodeUnknownSync(SonarrConfig)
