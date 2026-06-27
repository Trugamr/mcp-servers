import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  type HttpClientError,
  HttpClientResponse,
  type UrlParams,
} from "@effect/platform"
import { Effect, type ParseResult, Redacted, type Schema, type Scope } from "effect"
import type { ServarrRequestConfig } from "./config.js"

/**
 * Maps the engine's three failure modes onto one SDK's branded error types. Each
 * SDK passes its own constructors, so the typed error channel of `getJson`/etc.
 * stays concrete (e.g. `SonarrError`) while the request engine itself is shared.
 */
export interface HttpErrors<RequestError, ResponseError, DecodeError> {
  /** The request never reached the instance (connection refused, DNS, timeout, …). */
  readonly request: (cause: unknown) => RequestError
  /** The instance responded with a non-2xx status. */
  readonly response: (status: number, cause: unknown) => ResponseError
  /** The response body could not be parsed/decoded into the expected schema. */
  readonly decode: (cause: unknown) => DecodeError
}

/**
 * Options shared by every verb. `urlParams` keys with an `undefined` value are
 * dropped from the query string; never pass `null` (it serializes as `"null"`).
 */
export interface RequestOptions {
  readonly urlParams?: UrlParams.Input | undefined
}

/** The `X-Api-Key` header. Unwraps the `Redacted` key only here, at the request boundary. */
const apiKeyHeader = (config: ServarrRequestConfig) => ({
  "X-Api-Key": Redacted.value(config.apiKey),
})

/**
 * Build the verb helpers bound to one SDK's branded errors. The shared request
 * core funnels every request's transport, non-2xx, and decoding outcomes into that
 * SDK's typed error channel, so the failure contract is identical regardless of
 * method and no verb can forget the status check. Each helper declares its
 * `HttpClient` requirement rather than baking in a transport; discharge it at the
 * edge with `provideTransport`.
 */
export const makeHttp = <RequestError, ResponseError, DecodeError>(
  errors: HttpErrors<RequestError, ResponseError, DecodeError>,
) => {
  type Error = RequestError | ResponseError | DecodeError

  /**
   * Map the platform's transport/decoding failures onto the SDK's branded errors.
   * Kept separate from the non-2xx check so `catchTags` only ever discriminates the
   * three concrete `@effect/platform` tags — never the SDK's opaque error types.
   */
  const mapPlatformErrors = <A, R>(
    effect: Effect.Effect<
      A,
      HttpClientError.RequestError | HttpClientError.ResponseError | ParseResult.ParseError,
      R
    >,
  ): Effect.Effect<A, RequestError | DecodeError, R> =>
    effect.pipe(
      Effect.catchTags({
        RequestError: (cause) => Effect.fail(errors.request(cause)),
        ResponseError: (cause) => Effect.fail(errors.decode(cause)),
        ParseError: (cause) => Effect.fail(errors.decode(cause)),
      }),
    )

  /** Fail with a typed response error when the instance responds with a non-2xx status. */
  const ensureSuccess = (response: HttpClientResponse.HttpClientResponse) =>
    response.status >= 400 ? Effect.fail(errors.response(response.status, response)) : Effect.void

  /**
   * The shared request core: `send` the request, fail on a non-2xx status, then
   * `decode` the response — every outcome funneled into the branded error channel
   * and the response scope closed. Centralizing the status check here means no verb
   * can forget it.
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
  ): Effect.Effect<A, Error, HttpClient.HttpClient> =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* mapPlatformErrors(send(client))
      yield* ensureSuccess(response)
      return yield* mapPlatformErrors(decode(response))
    }).pipe(Effect.scoped)

  /** GET against the instance and decode the JSON body with `schema`. */
  const getJson = <A, I>(
    config: ServarrRequestConfig,
    schema: Schema.Schema<A, I>,
    path: string,
    options?: RequestOptions,
  ): Effect.Effect<A, Error, HttpClient.HttpClient> =>
    request(
      (client) =>
        client.get(`${config.baseUrl}${path}`, {
          headers: apiKeyHeader(config),
          urlParams: options?.urlParams,
        }),
      HttpClientResponse.schemaBodyJson(schema),
    )

  /** POST/PUT a JSON `body` and decode the JSON response with `schema`. */
  const sendJson = <A, I>(
    config: ServarrRequestConfig,
    method: "post" | "put",
    schema: Schema.Schema<A, I>,
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Effect.Effect<A, Error, HttpClient.HttpClient> =>
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
   * DELETE a resource. Servarr returns an empty body on success, so nothing is
   * decoded; a non-2xx status still fails through the typed error contract.
   */
  const del = (
    config: ServarrRequestConfig,
    path: string,
    options?: RequestOptions,
  ): Effect.Effect<void, Error, HttpClient.HttpClient> =>
    request(
      (client) =>
        client.del(`${config.baseUrl}${path}`, {
          headers: apiKeyHeader(config),
          urlParams: options?.urlParams,
        }),
      () => Effect.void,
    )

  return { getJson, sendJson, del } as const
}

/**
 * Provide the default `fetch` transport so an operation becomes fully provided for
 * its HTTP-client requirement. The single binding point for the HTTP client — swap
 * it for a configured client layer when one lands.
 */
export const provideTransport = Effect.provide(FetchHttpClient.layer)
