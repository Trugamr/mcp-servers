import {
  MOVIE_ROOT_FOLDER,
  RADARR_VERSION,
  type SeededMovie,
  seedMovie,
} from "@trugamr/testkit/radarr"
import { beforeAll, describe, expect, it } from "vitest"
import { RadarrResponseError } from "../../effect.js"
import { failureOf, runExit, successOf } from "./helpers.js"

// Drives the SDK against a real Radarr (booted by ./setup.ts), decoding actual
// Radarr payloads through the SDK's schemas so schema drift fails loudly.
describe("Radarr SDK against a pinned Radarr instance", () => {
  // One real movie seeded once for the whole file: movie reads assert its payload,
  // and the interactive release search needs a library movieId to search against.
  let seeded: SeededMovie
  beforeAll(async () => {
    seeded = await seedMovie()
  })

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
    it("lists the seeded movie, decoding the Movie payload", async () => {
      const movies = successOf(await runExit((radarr) => radarr.movie.list))
      const match = movies.find((entry) => entry.id === seeded.id)

      expect(match).toMatchObject({
        title: seeded.title,
        tmdbId: seeded.tmdbId,
        year: 2004,
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

  describe("release + queue reads", () => {
    it("runs an interactive search that decodes to no candidates without indexers", async () => {
      // The booted instance has no indexers configured, so the search is reachable
      // and decodes through Schema.Array(Release) but yields nothing. Live results
      // need a real indexer; grab needs a download client — neither is exercised here.
      const releases = successOf(await runExit((radarr) => radarr.release.search(seeded.id)))

      expect(releases).toEqual([])
    })

    it("lists an empty download queue on a fresh instance", async () => {
      const page = successOf(await runExit((radarr) => radarr.queue.list))

      expect(page).toMatchObject({ records: [], totalRecords: 0 })
    })
  })

  describe("quality profile + root folder reads", () => {
    it("lists the default quality profiles Radarr ships", async () => {
      const profiles = successOf(await runExit((radarr) => radarr.qualityProfile.list))

      expect(profiles.length).toBeGreaterThan(0)
      expect(typeof profiles[0]?.name).toBe("string")
    })

    it("lists the seeded root folder", async () => {
      const folders = successOf(await runExit((radarr) => radarr.rootFolder.list))

      expect(folders.some((folder) => folder.path === MOVIE_ROOT_FOLDER)).toBe(true)
    })
  })

  describe("movie lookup + add round-trip", () => {
    // A second film (Fight Club, tmdb 550) distinct from the seeded one, so the add
    // can't collide with an existing library entry.
    it("looks up a film by term against the metadata provider", async () => {
      const results = successOf(await runExit((radarr) => radarr.movie.lookup("Fight Club 1999")))
      const match = results.find((entry) => entry.tmdbId === 550)

      // Not in the library at this point, so Radarr omits the library id.
      expect(match).toMatchObject({ title: "Fight Club", year: 1999 })
      expect(match).not.toHaveProperty("id")
    })

    it("adds a movie by tmdbId, then removes it", async () => {
      const added = successOf(
        await runExit((radarr) =>
          radarr.movie.add({
            tmdbId: 550,
            qualityProfileId: 1,
            rootFolderPath: MOVIE_ROOT_FOLDER,
          }),
        ),
      )
      expect(added).toMatchObject({ tmdbId: 550, title: "Fight Club" })

      const removed = successOf(
        await runExit((radarr) => radarr.movie.remove(added.id, { deleteFiles: false })),
      )
      expect(removed).toBeUndefined()

      const movies = successOf(await runExit((radarr) => radarr.movie.list))
      expect(movies.some((entry) => entry.id === added.id)).toBe(false)
    })
  })
})
