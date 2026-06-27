import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { Sonarr, SonarrDecodeError, SonarrRequestError, SonarrResponseError } from "../effect.js"
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

describe("Sonarr service — system.getStatus", () => {
  it("decodes a valid status response", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(await runExit((sonarr) => sonarr.system.getStatus))

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

    successOf(await runExit((sonarr) => sonarr.system.getStatus))

    expect(received).toBe(apiKey)
  })

  it("normalizes a trailing slash in baseUrl so the request path stays clean", async () => {
    // The handler is registered for `statusUrl` (single slash). With
    // `onUnhandledRequest: "error"`, a baseUrl that left its trailing slash in
    // place would hit `…test//api/v3/…` and fail to match — so this succeeding
    // proves `decodeConfig`'s normalization is wired into the request.
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(
      await runExit((sonarr) => sonarr.system.getStatus, { baseUrl: `${baseUrl}/`, apiKey }),
    )

    expect(status.appName).toBe("Sonarr")
  })

  it("fails with a typed SonarrResponseError carrying the status code on a 401", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runExit((sonarr) => sonarr.system.getStatus))

    expect(error).toBeInstanceOf(SonarrResponseError)
    if (error instanceof SonarrResponseError) {
      expect(error.status).toBe(401)
    }
  })

  it("fails with a typed SonarrRequestError when Sonarr is unreachable", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.error()))

    const error = failureOf(await runExit((sonarr) => sonarr.system.getStatus))

    expect(error).toBeInstanceOf(SonarrRequestError)
  })

  it("fails with a typed SonarrDecodeError on a malformed body", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json({ nope: true })))

    const error = failureOf(await runExit((sonarr) => sonarr.system.getStatus))

    expect(error).toBeInstanceOf(SonarrDecodeError)
  })

  it("exposes operations under an explicit .v3 namespace that aliases the latest", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = successOf(await runExit((sonarr) => sonarr.v3.system.getStatus))
    expect(status.version).toBe(systemStatusFixture.version)

    // The flat surface mirrors the latest version (v3 today) — same operation refs,
    // so pinning `.v3` and using the flat alias hit the same endpoint.
    const aliased = await Effect.runPromise(
      Sonarr.pipe(
        Effect.map((sonarr) => sonarr.system.getStatus === sonarr.v3.system.getStatus),
        Effect.provide(Sonarr.layer({ baseUrl, apiKey })),
      ),
    )
    expect(aliased).toBe(true)
  })
})
