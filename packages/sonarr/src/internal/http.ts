import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  type HttpClientError,
  HttpClientResponse,
  type UrlParams,
} from "@effect/platform"
import { Effect, type ParseResult, Redacted, Schema, type Scope } from "effect"
import type { SonarrConfig } from "./config.js"
import type { SonarrError } from "./errors.js"
import { SonarrDecodeError, SonarrRequestError, SonarrResponseError } from "./errors.js"

const toDecodeError = (error: unknown) => new SonarrDecodeError({ cause: error })

/** The `X-Api-Key` header. Unwraps the `Redacted` key only here, at the request boundary. */
const apiKeyHeader = (config: SonarrConfig) => ({ "X-Api-Key": Redacted.value(config.apiKey) })

/** Fail with a typed `SonarrResponseError` when Sonarr responds with a non-2xx status. */
const ensureSuccess = (response: HttpClientResponse.HttpClientResponse) =>
  response.status >= 400
    ? Effect.fail(new SonarrResponseError({ status: response.status, cause: response }))
    : Effect.void

/**
 * Funnel a request's transport, non-2xx, and decoding outcomes into the typed
 * `SonarrError` channel and close the response scope. Every request pipes through
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
 * The shared request core: `send` the request, fail on a non-2xx status, then
 * `decode` the response — all funneled through `finalize`. Centralizing the status
 * check here means no verb can forget it. Declares its `HttpClient` requirement
 * rather than baking in a transport; discharge it at the edge with `provideTransport`.
 */
const request = <A>(
  send: (
    client: HttpClient.HttpClient,
  ) => Effect.Effect<
    HttpClientResponse.HttpClientResponse,
    HttpClientError.HttpClientError,
    Scope.Scope
  >,
  decode: (
    response: HttpClientResponse.HttpClientResponse,
  ) => Effect.Effect<A, HttpClientError.ResponseError | ParseResult.ParseError>,
): Effect.Effect<A, SonarrError, HttpClient.HttpClient> =>
  finalize(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* send(client)
      yield* ensureSuccess(response)
      return yield* decode(response)
    }),
  )

/**
 * Options shared by every verb. `urlParams` keys with an `undefined` value are
 * dropped from the query string; never pass `null` (it serializes as `"null"`).
 */
export interface RequestOptions {
  readonly urlParams?: UrlParams.Input | undefined
}

/** GET against the Sonarr instance and decode the JSON body with `schema`. */
export const getJson = <A, I>(
  config: SonarrConfig,
  schema: Schema.Schema<A, I>,
  path: string,
  options?: RequestOptions,
): Effect.Effect<A, SonarrError, HttpClient.HttpClient> =>
  request(
    (client) =>
      client.get(`${config.baseUrl}${path}`, {
        headers: apiKeyHeader(config),
        urlParams: options?.urlParams,
      }),
    HttpClientResponse.schemaBodyJson(schema),
  )

/** POST/PUT a JSON `body` and decode the JSON response with `schema`. */
export const sendJson = <A, I>(
  config: SonarrConfig,
  method: "post" | "put",
  schema: Schema.Schema<A, I>,
  path: string,
  body: unknown,
  options?: RequestOptions,
): Effect.Effect<A, SonarrError, HttpClient.HttpClient> =>
  request(
    (client) =>
      client[method](`${config.baseUrl}${path}`, {
        headers: apiKeyHeader(config),
        urlParams: options?.urlParams,
        body: HttpBody.unsafeJson(body),
      }),
    HttpClientResponse.schemaBodyJson(schema),
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
  request(
    (client) =>
      client.del(`${config.baseUrl}${path}`, {
        headers: apiKeyHeader(config),
        urlParams: options?.urlParams,
      }),
    () => Effect.void,
  )

/**
 * Provide the default `fetch` transport so an operation becomes fully provided
 * (`R = never`). The single binding point for the HTTP client — swap it for a
 * configured client layer when one lands.
 */
export const provideTransport = Effect.provide(FetchHttpClient.layer)
