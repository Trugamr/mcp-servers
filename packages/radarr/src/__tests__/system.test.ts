import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { Radarr, RadarrDecodeError, RadarrRequestError, RadarrResponseError } from "../effect.js"
import { systemStatusFixture } from "./fixtures/system-status.js"
import {
  apiKey,
  apiUrl,
  baseUrl,
  failureOf,
  runExit,
  setupMockServer,
  successOf,
} from "./helpers.js"

const statusUrl = apiUrl("/system/status")

const server = setupMockServer()

describe("Radarr service — system.getStatus", () => {
  it("decodes a valid status response", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(await runExit((radarr) => radarr.system.getStatus))

    expect(status.appName).toBe("Radarr")
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

    successOf(await runExit((radarr) => radarr.system.getStatus))

    expect(received).toBe(apiKey)
  })

  it("normalizes a trailing slash in baseUrl so the request path stays clean", async () => {
    // The handler is registered for `statusUrl` (single slash). With
    // `onUnhandledRequest: "error"`, a baseUrl that left its trailing slash in
    // place would hit `…test//api/v3/…` and fail to match — so this succeeding
    // proves `decodeConfig`'s normalization is wired into the request.
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(
      await runExit((radarr) => radarr.system.getStatus, { baseUrl: `${baseUrl}/`, apiKey }),
    )

    expect(status.appName).toBe("Radarr")
  })

  it("fails with a typed RadarrResponseError carrying the status code on a 401", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runExit((radarr) => radarr.system.getStatus))

    expect(error).toBeInstanceOf(RadarrResponseError)
    if (error instanceof RadarrResponseError) {
      expect(error.status).toBe(401)
    }
  })

  it("fails with a typed RadarrRequestError when Radarr is unreachable", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.error()))

    const error = failureOf(await runExit((radarr) => radarr.system.getStatus))

    expect(error).toBeInstanceOf(RadarrRequestError)
  })

  it("fails with a typed RadarrDecodeError on a malformed body", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json({ nope: true })))

    const error = failureOf(await runExit((radarr) => radarr.system.getStatus))

    expect(error).toBeInstanceOf(RadarrDecodeError)
  })

  it("exposes operations under an explicit .v3 namespace that aliases the latest", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(await runExit((radarr) => radarr.v3.system.getStatus))
    expect(status.version).toBe(systemStatusFixture.version)

    // The flat surface mirrors the latest version (v3 today) — same operation refs,
    // so pinning `.v3` and using the flat alias hit the same endpoint.
    const aliased = await Effect.runPromise(
      Radarr.pipe(
        Effect.map((radarr) => radarr.system.getStatus === radarr.v3.system.getStatus),
        Effect.provide(Radarr.layer({ baseUrl, apiKey })),
      ),
    )
    expect(aliased).toBe(true)
  })
})
