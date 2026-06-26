import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { Sonarr } from "../effect.js"
import { episodeFixture } from "./fixtures/episode.js"
import { apiKey, baseUrl, setupMockServer, successOf } from "./helpers.js"

const episodeUrl = `${baseUrl}/api/v3/episode`
const server = setupMockServer()
const TestSonarr = Sonarr.layer({ baseUrl, apiKey })

const runList = (params: { readonly seriesId: number; readonly seasonNumber?: number }) =>
  Effect.flatMap(Sonarr, (sonarr) => sonarr.episode.list(params)).pipe(
    Effect.provide(TestSonarr),
    Effect.runPromiseExit,
  )

describe("Sonarr service — episode.list", () => {
  it("sends seriesId and seasonNumber as query params", async () => {
    let url: URL | undefined
    server.use(
      http.get(episodeUrl, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json([episodeFixture])
      }),
    )

    const episodes = successOf(await runList({ seriesId: 5, seasonNumber: 2 }))

    expect(episodes[0]?.title).toBe(episodeFixture.title)
    expect(url?.searchParams.get("seriesId")).toBe("5")
    expect(url?.searchParams.get("seasonNumber")).toBe("2")
  })

  it("omits seasonNumber from the query when not provided", async () => {
    let url: URL | undefined
    server.use(
      http.get(episodeUrl, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json([episodeFixture])
      }),
    )

    successOf(await runList({ seriesId: 5 }))

    expect(url?.searchParams.get("seriesId")).toBe("5")
    expect(url?.searchParams.has("seasonNumber")).toBe(false)
  })
})
