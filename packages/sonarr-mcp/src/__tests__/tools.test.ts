import { Sonarr } from "@trugamr/sonarr/effect"
import { Cause, Effect, Exit, Option } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { getSystemStatus } from "../tools.js"
import { systemStatusFixture } from "./fixtures/system-status.js"

const baseUrl = "http://sonarr.test"
const apiKey = "test-api-key"
const statusUrl = `${baseUrl}/api/v3/system/status`
const TestSonarr = Sonarr.layer({ baseUrl, apiKey })

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** Drive the handler with a Sonarr client pointed at the mocked instance. */
const runStatus = () => Effect.flatMap(Sonarr, getSystemStatus).pipe(Effect.provide(TestSonarr))

describe("get_system_status tool handler", () => {
  it("returns the decoded status on success", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = await Effect.runPromise(runStatus())

    expect(status.appName).toBe("Sonarr")
    expect(status.version).toBe(systemStatusFixture.version)
  })

  it("maps a SonarrError into the tool-error shape (401 → SonarrResponseError)", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(runStatus())

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.isSome(failure)).toBe(true)
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "SonarrResponseError",
      message: "Sonarr returned HTTP 401",
    })
  })
})
