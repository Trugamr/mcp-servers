import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  type HttpClientError,
  HttpClientResponse,
  type UrlParams,
} from "@effect/platform"
import { Effect, type ParseResult, Redacted, Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import type { SonarrError } from "./errors.js"
import { SonarrDecodeError, SonarrRequestError, SonarrResponseError } from "./errors.js"

const toDecodeError = (error: unknown) => new SonarrDecodeError({ cause: error })

/** The `X-Api-Key` header. Unwraps the `Redacted` key only here, at the request boundary. */
const apiKeyHeader = (config: SonarrConfig) => ({ "X-Api-Key": Redacted.value(config.apiKey) })

/**
 * Funnel a request's transport, non-2xx, and decoding outcomes into the typed
 * `SonarrError` channel and close the response scope. Every verb pipes through
 * this, so the failure contract is identical regardless of method.
 */
const finalize = <A, R>(
  effect: Effect.Effect<
    A,
    | SonarrResponseError
    | HttpClientError.RequestError
    | HttpClientError.ResponseError
    | ParseResult.ParseError,
    R
  >,
) =>
  effect.pipe(
    Effect.catchTags({
      RequestError: (error) => new SonarrRequestError({ cause: error }),
      ResponseError: toDecodeError,
      ParseError: toDecodeError,
    }),
    Effect.scoped,
  )

/**
 * Options shared by every verb. `urlParams` keys with an `undefined` value are
 * dropped from the query string; never pass `null` (it serializes as `"null"`).
 */
export interface RequestOptions {
  readonly urlParams?: UrlParams.Input | undefined
}

/**
 * GET against the Sonarr instance and decode the JSON body with `schema`. A
 * reusable primitive — it declares its `HttpClient` requirement rather than baking
 * in a transport; discharge it at the operation edge with `provideTransport`.
 */
export const getJson = <A, I>(
  config: SonarrConfig,
  schema: Schema.Schema<A, I>,
  path: string,
  options?: RequestOptions,
): Effect.Effect<A, SonarrError, HttpClient.HttpClient> =>
  finalize(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get(`${config.baseUrl}${path}`, {
        headers: apiKeyHeader(config),
        urlParams: options?.urlParams,
      })

      if (response.status >= 400) {
        return yield* new SonarrResponseError({ status: response.status, cause: response })
      }

      return yield* HttpClientResponse.schemaBodyJson(schema)(response)
    }),
  )

/**
 * POST/PUT a JSON `body` and decode the JSON response with `schema`. Shares the
 * typed failure contract and `HttpClient` requirement with `getJson`.
 */
export const sendJson = <A, I>(
  config: SonarrConfig,
  method: "post" | "put",
  schema: Schema.Schema<A, I>,
  path: string,
  body: unknown,
  options?: RequestOptions,
): Effect.Effect<A, SonarrError, HttpClient.HttpClient> =>
  finalize(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client[method](`${config.baseUrl}${path}`, {
        headers: apiKeyHeader(config),
        urlParams: options?.urlParams,
        body: HttpBody.unsafeJson(body),
      })

      if (response.status >= 400) {
        return yield* new SonarrResponseError({ status: response.status, cause: response })
      }

      return yield* HttpClientResponse.schemaBodyJson(schema)(response)
    }),
  )

/**
 * DELETE a resource. Sonarr returns an empty body on success, so nothing is
 * decoded; a non-2xx status still fails through the typed `SonarrError` contract.
 */
export const del = (
  config: SonarrConfig,
  path: string,
  options?: RequestOptions,
): Effect.Effect<void, SonarrError, HttpClient.HttpClient> =>
  finalize(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.del(`${config.baseUrl}${path}`, {
        headers: apiKeyHeader(config),
        urlParams: options?.urlParams,
      })

      if (response.status >= 400) {
        return yield* new SonarrResponseError({ status: response.status, cause: response })
      }
    }),
  )

/**
 * Provide the default `fetch` transport so an operation becomes fully provided
 * (`R = never`). The single binding point for the HTTP client — swap it for a
 * configured client layer when one lands.
 */
export const provideTransport = Effect.provide(FetchHttpClient.layer)
