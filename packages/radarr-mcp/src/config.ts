import { Radarr } from "@trugamr/radarr/effect"
import { Config, Effect, Layer, Redacted } from "effect"

/**
 * The Radarr client, built from `RADARR_BASE_URL` / `RADARR_API_KEY`. The API key
 * is read with `Config.redacted` and unwrapped at the SDK boundary, which re-wraps
 * it as `Redacted` for storage — that stored form is what keeps it out of logs and
 * errors. Missing or malformed values fail the layer, so the server refuses to
 * start rather than failing on the first call.
 */
export const RadarrLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    yield* Effect.logInfo("Loading Radarr configuration from RADARR_BASE_URL / RADARR_API_KEY")
    const baseUrl = yield* Config.string("RADARR_BASE_URL")
    const apiKey = yield* Config.redacted("RADARR_API_KEY")
    // baseUrl is a plain URL, safe to log; the API key stays redacted and is never logged.
    yield* Effect.logInfo(`Loaded Radarr configuration (baseUrl=${baseUrl})`)
    return Radarr.layer({ baseUrl, apiKey: Redacted.value(apiKey) })
  }),
)
