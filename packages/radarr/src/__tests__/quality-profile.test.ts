import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RadarrResponseError } from "../effect.js"
import { qualityProfilesFixture } from "./fixtures/quality-profile.js"
import { apiKey, apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

const url = apiUrl("/qualityprofile")
const server = setupMockServer()

describe("Radarr service — quality profile", () => {
  it("lists quality profiles, sending the api key and decoding each profile", async () => {
    let header: string | null = null
    server.use(
      http.get(url, ({ request }) => {
        header = request.headers.get("X-Api-Key")
        return HttpResponse.json(qualityProfilesFixture)
      }),
    )

    const profiles = successOf(await runExit((radarr) => radarr.qualityProfile.list))

    expect(header).toBe(apiKey)
    expect(profiles).toHaveLength(2)
    expect(profiles[1]).toMatchObject({ id: 4, name: "HD-1080p" })
  })

  it("maps a non-2xx status to a typed RadarrResponseError", async () => {
    server.use(http.get(url, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runExit((radarr) => radarr.qualityProfile.list))

    expect(error).toBeInstanceOf(RadarrResponseError)
  })
})
