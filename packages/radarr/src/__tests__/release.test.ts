import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RadarrResponseError } from "../effect.js"
import { releasesFixture } from "./fixtures/release.js"
import { apiKey, apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

const releaseUrl = apiUrl("/release")
const server = setupMockServer()

describe("Radarr service — release", () => {
  it("searches releases for a movie, sending movieId + api key and decoding candidates", async () => {
    let url: URL | undefined
    let header: string | null = null
    server.use(
      http.get(releaseUrl, ({ request }) => {
        url = new URL(request.url)
        header = request.headers.get("X-Api-Key")
        return HttpResponse.json(releasesFixture)
      }),
    )

    const releases = successOf(await runExit((radarr) => radarr.release.search(123)))

    // movieId rides the query string; the api key rides the header.
    expect(url?.searchParams.get("movieId")).toBe("123")
    expect(header).toBe(apiKey)
    expect(releases).toHaveLength(2)
    // The torrent carries seeders and decodes its nested quality; the usenet release
    // has none (optionalNullable -> absent).
    expect(releases[0]).toMatchObject({ seeders: 42, quality: { quality: { resolution: 1080 } } })
    expect(releases[1]?.seeders).toBeUndefined()
    // Unmodeled keys (customFormats, revision) are dropped.
    expect(releases[0]).not.toHaveProperty("customFormats")
    expect(releases[0]?.quality).not.toHaveProperty("revision")
  })

  it("grabs a release, posting guid + indexerId and resolving void on an empty body", async () => {
    let body: unknown
    server.use(
      http.post(releaseUrl, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 201 })
      }),
    )

    const result = successOf(
      await runExit((radarr) => radarr.release.grab({ guid: "abc", indexerId: 2 })),
    )

    expect(result).toBeUndefined()
    expect(body).toEqual({ guid: "abc", indexerId: 2 })
  })

  it("maps a failed grab to a typed RadarrResponseError", async () => {
    server.use(http.post(releaseUrl, () => new HttpResponse(null, { status: 400 })))

    const error = failureOf(
      await runExit((radarr) => radarr.release.grab({ guid: "x", indexerId: 9 })),
    )

    expect(error).toBeInstanceOf(RadarrResponseError)
  })
})
