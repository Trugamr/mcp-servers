import { FetchHttpClient, HttpClient, HttpClientResponse } from "@effect/platform"
import { Effect, Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import type { SonarrError } from "./errors.js"
import { SonarrDecodeError, SonarrRequestError, SonarrResponseError } from "./errors.js"

const toDecodeError = (error: unknown) => new SonarrDecodeError({ cause: error })

/**
 * Issue a GET against the Sonarr instance and decode the JSON body with `schema`.
 * Stays a reusable primitive — it declares its `HttpClient` requirement instead of
 * baking in a transport — and funnels every failure into a typed `SonarrError`.
 * Discharge the requirement at the operation edge with `provideTransport`.
 */
export const getJson = <A, I>(
  config: SonarrConfig,
  schema: Schema.Schema<A, I>,
  path: string,
): Effect.Effect<A, SonarrError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(`${config.baseUrl}${path}`, {
      headers: { "X-Api-Key": config.apiKey },
    })

    if (response.status >= 400) {
      return yield* new SonarrResponseError({ status: response.status, cause: response })
    }

    return yield* HttpClientResponse.schemaBodyJson(schema)(response)
  }).pipe(
    Effect.catchTags({
      RequestError: (error) => new SonarrRequestError({ cause: error }),
      ResponseError: toDecodeError,
      ParseError: toDecodeError,
    }),
    Effect.scoped,
  )

/**
 * Provide the default `fetch` transport so an operation becomes fully provided
 * (`R = never`). The single binding point for the HTTP client — swap it for a
 * configured client layer when one lands.
 */
export const provideTransport = Effect.provide(FetchHttpClient.layer)
