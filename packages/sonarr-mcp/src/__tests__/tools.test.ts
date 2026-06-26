import { Sonarr, type SonarrService } from "@trugamr/sonarr/effect"
import { Cause, Effect, Exit, Option } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createTag, getSeries, getSystemStatus, listEpisodes, listSeries } from "../tools.js"
import { episodeFixture } from "./fixtures/episode.js"
import { seriesFixture } from "./fixtures/series.js"
import { systemStatusFixture } from "./fixtures/system-status.js"
import { tagFixture } from "./fixtures/tag.js"

const baseUrl = "http://sonarr.test"
const apiKey = "test-api-key"
const statusUrl = `${baseUrl}/api/v3/system/status`
const TestSonarr = Sonarr.layer({ baseUrl, apiKey })

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** Drive a handler with a Sonarr client pointed at the mocked instance. */
const run = <A, E>(build: (sonarr: SonarrService) => Effect.Effect<A, E>) =>
  Effect.flatMap(Sonarr, build).pipe(Effect.provide(TestSonarr))

describe("get_system_status tool handler", () => {
  it("returns the decoded status on success", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = await Effect.runPromise(run(getSystemStatus))

    expect(status.appName).toBe("Sonarr")
    expect(status.version).toBe(systemStatusFixture.version)
  })

  it("maps a SonarrError into the tool-error shape (401 → SonarrResponseError)", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(run(getSystemStatus))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.isSome(failure)).toBe(true)
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "SonarrResponseError",
      message: "Sonarr returned HTTP 401",
    })
  })
})

describe("library tool handlers", () => {
  it("list_series returns the decoded series", async () => {
    server.use(http.get(`${baseUrl}/api/v3/series`, () => HttpResponse.json([seriesFixture])))

    const series = await Effect.runPromise(run(listSeries))

    expect(series[0]?.title).toBe(seriesFixture.title)
  })

  it("get_series interpolates the id into the request path", async () => {
    server.use(http.get(`${baseUrl}/api/v3/series/5`, () => HttpResponse.json(seriesFixture)))

    const series = await Effect.runPromise(run((sonarr) => getSeries(sonarr, 5)))

    expect(series.id).toBe(5)
  })

  it("list_episodes forwards seriesId and seasonNumber as query params", async () => {
    let url: URL | undefined
    server.use(
      http.get(`${baseUrl}/api/v3/episode`, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json([episodeFixture])
      }),
    )

    await Effect.runPromise(run((sonarr) => listEpisodes(sonarr, { seriesId: 5, seasonNumber: 2 })))

    expect(url?.searchParams.get("seriesId")).toBe("5")
    expect(url?.searchParams.get("seasonNumber")).toBe("2")
  })

  it("create_tag posts the label and returns the created tag", async () => {
    server.use(http.post(`${baseUrl}/api/v3/tag`, () => HttpResponse.json(tagFixture)))

    const tag = await Effect.runPromise(run((sonarr) => createTag(sonarr, "anime")))

    expect(tag.label).toBe(tagFixture.label)
  })

  it("maps a SonarrError into the tool-error shape (401 on list_series)", async () => {
    server.use(http.get(`${baseUrl}/api/v3/series`, () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(run(listSeries))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "SonarrResponseError",
      message: "Sonarr returned HTTP 401",
    })
  })
})
