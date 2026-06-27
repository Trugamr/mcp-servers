import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RadarrResponseError } from "../effect.js"
import { movieFixture } from "./fixtures/movie.js"
import { apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

const movieUrl = apiUrl("/movie")

const server = setupMockServer()

describe("Radarr service — movie", () => {
  it("lists movies and normalizes a null field to absent", async () => {
    server.use(http.get(movieUrl, () => HttpResponse.json([movieFixture])))

    const movies = successOf(await runExit((radarr) => radarr.movie.list))

    expect(movies).toHaveLength(1)
    expect(movies[0]?.tmdbId).toBe(movieFixture.tmdbId)
    // `certification: null` in the payload decodes to absent, and the nested
    // `ratings`/`collection` keys the schema doesn't model are dropped.
    expect(movies[0]?.certification).toBeUndefined()
    expect(movies[0]).not.toHaveProperty("ratings")
  })

  it("gets a movie by id, interpolating it into the path", async () => {
    // Registered only for `/movie/5`; onUnhandledRequest: "error" catches wrong paths.
    server.use(http.get(`${movieUrl}/5`, () => HttpResponse.json({ ...movieFixture, id: 5 })))

    const movie = successOf(await runExit((radarr) => radarr.movie.get(5)))

    expect(movie.id).toBe(5)
    expect(movie.title).toBe(movieFixture.title)
  })

  it("maps a non-2xx status to a typed RadarrResponseError", async () => {
    server.use(http.get(`${movieUrl}/999`, () => new HttpResponse(null, { status: 404 })))

    const error = failureOf(await runExit((radarr) => radarr.movie.get(999)))

    expect(error).toBeInstanceOf(RadarrResponseError)
  })
})
