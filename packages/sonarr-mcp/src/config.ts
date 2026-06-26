import { Sonarr } from "@trugamr/sonarr/effect"
import { Config, Effect, Layer, Redacted } from "effect"

/**
 * The Sonarr client, built from `SONARR_BASE_URL` / `SONARR_API_KEY`. The API key
 * is read with `Config.redacted` and unwrapped at the SDK boundary, which re-wraps
 * it as `Redacted` for storage — that stored form is what keeps it out of logs and
 * errors. Missing or malformed values fail the layer, so the server refuses to
 * start rather than failing on the first call.
 */
export const SonarrLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const baseUrl = yield* Config.string("SONARR_BASE_URL")
    const apiKey = yield* Config.redacted("SONARR_API_KEY")
    return Sonarr.layer({ baseUrl, apiKey: Redacted.value(apiKey) })
  }),
)
