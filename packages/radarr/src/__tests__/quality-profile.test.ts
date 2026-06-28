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

  it("gets a profile by id with its items tree, format scores, and language", async () => {
    server.use(http.get(`${url}/4`, () => HttpResponse.json(qualityProfilesFixture[1])))

    const profile = successOf(await runExit((radarr) => radarr.qualityProfile.get(4)))

    expect(profile).toMatchObject({
      id: 4,
      name: "HD-1080p",
      minUpgradeFormatScore: 1,
      formatItems: [{ format: 2, score: 0 }],
      language: { id: 1, name: "English" },
    })
    // The unmodeled `quality.modifier` is dropped by the lean decode.
    expect(profile.items[0]?.quality).not.toHaveProperty("modifier")
  })

  it("creates a profile by posting the full body, returning the created profile", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post(url, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...qualityProfilesFixture[1], id: 9 })
      }),
    )

    const created = successOf(
      await runExit((radarr) =>
        radarr.qualityProfile.create({
          name: "New",
          upgradeAllowed: true,
          cutoff: 7,
          minFormatScore: 0,
          cutoffFormatScore: 0,
          items: [{ quality: { id: 7, name: "Bluray-1080p" }, allowed: true }],
        }),
      ),
    )

    expect(body).toMatchObject({ name: "New", cutoff: 7 })
    expect(created.id).toBe(9)
  })

  it("updates a profile by merging the patch over the fetched resource, preserving unmodeled fields", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      // The GET carries an unmodeled `appProfileId` the typed schema doesn't know about.
      http.get(`${url}/4`, () =>
        HttpResponse.json({ ...qualityProfilesFixture[1], appProfileId: 1 }),
      ),
      http.put(`${url}/4`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...qualityProfilesFixture[1], name: "Renamed" })
      }),
    )

    const updated = successOf(
      await runExit((radarr) => radarr.qualityProfile.update(4, { name: "Renamed" })),
    )

    // The PUT body overlays the patch onto the full fetched resource — id and the
    // unmodeled `appProfileId` survive, so the update never silently drops fields.
    expect(body).toMatchObject({ id: 4, name: "Renamed", cutoffFormatScore: 0, appProfileId: 1 })
    expect(updated.name).toBe("Renamed")
  })

  it("removes a profile by id, resolving void", async () => {
    server.use(http.delete(`${url}/4`, () => new HttpResponse(null, { status: 200 })))

    const result = successOf(await runExit((radarr) => radarr.qualityProfile.remove(4)))

    expect(result).toBeUndefined()
  })

  it("maps a non-2xx status to a typed RadarrResponseError", async () => {
    server.use(http.get(url, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runExit((radarr) => radarr.qualityProfile.list))

    expect(error).toBeInstanceOf(RadarrResponseError)
  })
})
