import { RADARR_VERSION, type SeededMovie, seedMovie } from "@trugamr/testkit/radarr"
import { beforeAll, describe, expect, it } from "vitest"
import { RadarrResponseError } from "../../effect.js"
import { failureOf, runExit, successOf } from "./helpers.js"

// Drives the SDK against a real Radarr (booted by ./setup.ts), decoding actual
// Radarr payloads through the SDK's schemas so schema drift fails loudly.
describe("Radarr SDK against a pinned Radarr instance", () => {
  describe("system.getStatus", () => {
    it("decodes the status and reports the pinned version", async () => {
      const status = successOf(await runExit((radarr) => radarr.system.getStatus))

      expect(status.appName).toBe("Radarr")
      expect(status.version).toBe(RADARR_VERSION)
    })

    it("returns a typed RadarrResponseError for an unknown movie id", async () => {
      const error = failureOf(await runExit((radarr) => radarr.movie.get(999_999)))

      expect(error).toBeInstanceOf(RadarrResponseError)
      expect(error).toMatchObject({ status: 404 })
    })
  })

  describe("movie reads (seeded with a real film)", () => {
    let seeded: SeededMovie
    beforeAll(async () => {
      seeded = await seedMovie()
    })

    it("lists the seeded movie, decoding the Movie payload", async () => {
      const movies = successOf(await runExit((radarr) => radarr.movie.list))
      const match = movies.find((entry) => entry.id === seeded.id)

      expect(match).toMatchObject({
        title: seeded.title,
        tmdbId: seeded.tmdbId,
        year: 1994,
        status: "released",
      })
    })

    it("gets the seeded movie by id, decoding its payload", async () => {
      const movie = successOf(await runExit((radarr) => radarr.movie.get(seeded.id)))

      expect(movie).toMatchObject({
        id: seeded.id,
        tmdbId: seeded.tmdbId,
        status: "released",
        hasFile: false,
      })
    })
  })
})
