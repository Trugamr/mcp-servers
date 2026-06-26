import { Cause, Effect, Exit, Option } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  Sonarr,
  SonarrDecodeError,
  SonarrRequestError,
  SonarrResponseError,
  type SonarrConfigInput,
} from "../effect.js"
import { systemStatusFixture } from "./fixtures/system-status.js"

const baseUrl = "http://sonarr.test"
const apiKey = "test-api-key"
const statusUrl = `${baseUrl}/api/v3/system/status`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Resolve `system.getStatus` against a given config to an Exit, so each test can
// assert on the success value or read the typed error straight from the failure
// channel.
const runStatus = (config: SonarrConfigInput = { baseUrl, apiKey }) =>
  Effect.flatMap(Sonarr, (sonarr) => sonarr.system.getStatus).pipe(
    Effect.provide(Sonarr.layer(config)),
    Effect.runPromiseExit,
  )

const successOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isFailure(exit)) {
    throw new Error(`expected success: ${Cause.pretty(exit.cause)}`)
  }
  return exit.value
}

// Pull the typed failure out of the channel. A defect (or success) yields `None`
// here and throws, so every error test also proves the failure is typed — not a
// thrown exception or an Effect defect.
const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (Exit.isSuccess(exit)) {
    throw new Error("expected failure, got success")
  }
  return Option.getOrThrow(Cause.failureOption(exit.cause))
}

describe("Sonarr service — system.getStatus", () => {
  it("decodes a valid status response", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(await runStatus())

    expect(status.appName).toBe("Sonarr")
    expect(status.version).toBe(systemStatusFixture.version)
  })

  it("sends the X-Api-Key header", async () => {
    let received: string | null = null
    server.use(
      http.get(statusUrl, ({ request }) => {
        received = request.headers.get("x-api-key")
        return HttpResponse.json(systemStatusFixture)
      }),
    )

    successOf(await runStatus())

    expect(received).toBe(apiKey)
  })

  it("normalizes a trailing slash in baseUrl so the request path stays clean", async () => {
    // The handler is registered for `statusUrl` (single slash). With
    // `onUnhandledRequest: "error"`, a baseUrl that left its trailing slash in
    // place would hit `…test//api/v3/…` and fail to match — so this succeeding
    // proves `decodeConfig`'s normalization is wired into the request.
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(await runStatus({ baseUrl: `${baseUrl}/`, apiKey }))

    expect(status.appName).toBe("Sonarr")
  })

  it("fails with a typed SonarrResponseError carrying the status code on a 401", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runStatus())

    expect(error).toBeInstanceOf(SonarrResponseError)
    if (error instanceof SonarrResponseError) {
      expect(error.status).toBe(401)
    }
  })

  it("fails with a typed SonarrRequestError when Sonarr is unreachable", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.error()))

    const error = failureOf(await runStatus())

    expect(error).toBeInstanceOf(SonarrRequestError)
  })

  it("fails with a typed SonarrDecodeError on a malformed body", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json({ nope: true })))

    const error = failureOf(await runStatus())

    expect(error).toBeInstanceOf(SonarrDecodeError)
  })
})
