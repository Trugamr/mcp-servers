import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RadarrResponseError } from "../effect.js"
import { languagesFixture } from "./fixtures/language.js"
import { apiKey, apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

const url = apiUrl("/language")
const server = setupMockServer()

describe("Radarr service — language", () => {
  it("lists languages, sending the api key and decoding each", async () => {
    let header: string | null = null
    server.use(
      http.get(url, ({ request }) => {
        header = request.headers.get("X-Api-Key")
        return HttpResponse.json(languagesFixture)
      }),
    )

    const languages = successOf(await runExit((radarr) => radarr.language.list))

    expect(header).toBe(apiKey)
    expect(languages).toContainEqual({ id: 1, name: "English" })
  })

  it("maps a non-2xx status to a typed RadarrResponseError", async () => {
    server.use(http.get(url, () => new HttpResponse(null, { status: 500 })))

    const error = failureOf(await runExit((radarr) => radarr.language.list))

    expect(error).toBeInstanceOf(RadarrResponseError)
  })
})
