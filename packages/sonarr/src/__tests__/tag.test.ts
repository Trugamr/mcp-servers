import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { Sonarr, SonarrResponseError } from "../effect.js"
import { tagFixture } from "./fixtures/tag.js"
import { apiKey, baseUrl, failureOf, setupMockServer, successOf } from "./helpers.js"

const tagUrl = `${baseUrl}/api/v3/tag`
const server = setupMockServer()
const TestSonarr = Sonarr.layer({ baseUrl, apiKey })

const runCreate = (label: string) =>
  Effect.flatMap(Sonarr, (sonarr) => sonarr.tag.create(label)).pipe(
    Effect.provide(TestSonarr),
    Effect.runPromiseExit,
  )

const runDelete = (id: number) =>
  Effect.flatMap(Sonarr, (sonarr) => sonarr.tag.delete(id)).pipe(
    Effect.provide(TestSonarr),
    Effect.runPromiseExit,
  )

describe("Sonarr service — tag writes", () => {
  it("creates a tag, sending the label in the JSON body", async () => {
    let body: unknown
    server.use(
      http.post(tagUrl, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(tagFixture)
      }),
    )

    const tag = successOf(await runCreate("anime"))

    expect(tag.label).toBe(tagFixture.label)
    expect(body).toEqual({ label: "anime" })
  })

  it("deletes a tag, succeeding on an empty 2xx response", async () => {
    // Registered only for `/tag/7`; succeeding proves the id is interpolated and
    // that an empty body is accepted (nothing is decoded on delete).
    server.use(http.delete(`${tagUrl}/7`, () => new HttpResponse(null, { status: 200 })))

    const result = successOf(await runDelete(7))

    expect(result).toBeUndefined()
  })

  it("maps a failed delete to a typed SonarrResponseError", async () => {
    server.use(http.delete(`${tagUrl}/999`, () => new HttpResponse(null, { status: 404 })))

    const error = failureOf(await runDelete(999))

    expect(error).toBeInstanceOf(SonarrResponseError)
  })
})
