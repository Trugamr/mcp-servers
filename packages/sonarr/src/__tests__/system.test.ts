import { Cause, Effect, Exit, Option } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { getStatus } from "../effect.js"
import { Sonarr, SonarrDecodeError, SonarrRequestError, SonarrResponseError } from "../index.js"
import { decodeConfig } from "../internal/config.js"
import { systemStatusFixture } from "./fixtures/system-status.js"

const baseUrl = "http://sonarr.test"
const apiKey = "test-api-key"
const statusUrl = `${baseUrl}/api/v3/system/status`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const sonarr = new Sonarr({ baseUrl, apiKey })

describe("Promise surface — system.getStatus", () => {
  it("decodes a valid status response", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = await sonarr.system.getStatus()

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

    await sonarr.system.getStatus()

    expect(received).toBe(apiKey)
  })

  it("normalizes a trailing slash in baseUrl so the request path stays clean", async () => {
    // The handler is registered for `statusUrl` (single slash). With
    // `onUnhandledRequest: "error"`, a baseUrl that left its trailing slash in
    // place would hit `…test//api/v3/…` and fail to match — so this resolving
    // proves `decodeConfig`'s normalization is actually wired into the request.
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const client = new Sonarr({ baseUrl: `${baseUrl}/`, apiKey })

    await expect(client.system.getStatus()).resolves.toMatchObject({ appName: "Sonarr" })
  })

  it("rejects with SonarrResponseError carrying the status code on a 401", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const error = await sonarr.system.getStatus().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SonarrResponseError)
    expect((error as SonarrResponseError).status).toBe(401)
  })

  it("rejects with SonarrRequestError when Sonarr is unreachable", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.error()))

    const error = await sonarr.system.getStatus().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SonarrRequestError)
  })

  it("rejects with SonarrDecodeError on a malformed body", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json({ nope: true })))

    await expect(sonarr.system.getStatus()).rejects.toBeInstanceOf(SonarrDecodeError)
  })
})

describe("Effect surface — getStatus", () => {
  it("decodes a valid status response", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = await Effect.runPromise(getStatus(decodeConfig({ baseUrl, apiKey })))

    expect(status.version).toBe(systemStatusFixture.version)
  })

  it("puts a typed SonarrResponseError in the failure channel — no throw, no defect", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 500 })))

    const exit = await Effect.runPromiseExit(getStatus(decodeConfig({ baseUrl, apiKey })))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.isSome(failure)).toBe(true)
    const error = Option.getOrThrow(failure)
    expect(error).toBeInstanceOf(SonarrResponseError)
    expect((error as SonarrResponseError).status).toBe(500)
  })
})
