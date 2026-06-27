import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { SonarrResponseError } from "../effect.js"
import { seriesFixture } from "./fixtures/series.js"
import { apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

const seriesUrl = apiUrl("/series")
const server = setupMockServer()

describe("Sonarr service — series", () => {
  it("lists series and normalizes a null field to absent", async () => {
    server.use(http.get(seriesUrl, () => HttpResponse.json([seriesFixture])))

    const series = successOf(await runExit((sonarr) => sonarr.series.list))

    expect(series).toHaveLength(1)
    expect(series[0]?.title).toBe(seriesFixture.title)
    // `network` is null in the payload; `optionalNullable` accepts it and drops it.
    expect(series[0]?.network).toBeUndefined()
  })

  it("gets a series by id, interpolating it into the path", async () => {
    // Registered only for `/series/5`; with `onUnhandledRequest: "error"`, this
    // succeeding proves `series.get(5)` builds `/api/v3/series/5`.
    server.use(http.get(`${seriesUrl}/5`, () => HttpResponse.json(seriesFixture)))

    const series = successOf(await runExit((sonarr) => sonarr.series.get(5)))

    expect(series.id).toBe(5)
    expect(series.title).toBe(seriesFixture.title)
  })

  it("maps a non-2xx status to a typed SonarrResponseError", async () => {
    server.use(http.get(seriesUrl, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runExit((sonarr) => sonarr.series.list))

    expect(error).toBeInstanceOf(SonarrResponseError)
  })
})
