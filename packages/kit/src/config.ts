import { type Redacted, Schema } from "effect"

/**
 * `baseUrl` must be absolute http(s); its trailing slashes are stripped during
 * decode so joined request paths never produce a double slash. Each SDK composes
 * this into its own named config struct.
 */
export const BaseUrl = Schema.transform(
  Schema.String.pipe(Schema.pattern(/^https?:\/\//)),
  Schema.String,
  {
    strict: true,
    decode: (url) => url.replace(/\/+$/, ""),
    encode: (url) => url,
  },
)

/**
 * The API key, stored as `Redacted` so it prints as `<redacted>` in logs, errors,
 * and `JSON.stringify`. Input stays a plain non-empty string; unwrap with
 * `Redacted.value` only at the request boundary.
 */
export const ApiKey = Schema.Redacted(Schema.String.pipe(Schema.minLength(1)))

/**
 * The decoded config the HTTP engine reads: an absolute `baseUrl` and a redacted
 * `apiKey`. Every SDK's config struct is structurally assignable to this, so the
 * engine stays agnostic of the app-specific config type.
 */
export interface ServarrRequestConfig {
  readonly baseUrl: string
  readonly apiKey: Redacted.Redacted<string>
}
