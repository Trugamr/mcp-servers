import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RadarrResponseError } from "../effect.js"
import { rootFoldersFixture } from "./fixtures/root-folder.js"
import { apiKey, apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

const url = apiUrl("/rootfolder")
const server = setupMockServer()

describe("Radarr service — root folder", () => {
  it("lists root folders, sending the api key and decoding path + free space", async () => {
    let header: string | null = null
    server.use(
      http.get(url, ({ request }) => {
        header = request.headers.get("X-Api-Key")
        return HttpResponse.json(rootFoldersFixture)
      }),
    )

    const folders = successOf(await runExit((radarr) => radarr.rootFolder.list))

    expect(header).toBe(apiKey)
    expect(folders[0]).toMatchObject({ id: 1, path: "/movies", accessible: true })
    // Unmodeled keys (unmappedFolders) are dropped.
    expect(folders[0]).not.toHaveProperty("unmappedFolders")
  })

  it("maps a non-2xx status to a typed RadarrResponseError", async () => {
    server.use(http.get(url, () => new HttpResponse(null, { status: 401 })))

    const error = failureOf(await runExit((radarr) => radarr.rootFolder.list))

    expect(error).toBeInstanceOf(RadarrResponseError)
  })
})
