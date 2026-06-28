import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RadarrResponseError } from "../effect.js"
import { movieFixture } from "./fixtures/movie.js"
import { movieLookupFixture, movieLookupTmdbFixture } from "./fixtures/movie-lookup.js"
import { apiKey, apiUrl, failureOf, runExit, setupMockServer, successOf } from "./helpers.js"

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

  it("looks up movies by term, sending the term + api key and decoding candidates", async () => {
    let url: URL | undefined
    let header: string | null = null
    server.use(
      http.get(`${movieUrl}/lookup`, ({ request }) => {
        url = new URL(request.url)
        header = request.headers.get("X-Api-Key")
        return HttpResponse.json(movieLookupFixture)
      }),
    )

    const results = successOf(await runExit((radarr) => radarr.movie.lookup("fight club")))

    // The term rides the query string; the api key rides the header.
    expect(url?.searchParams.get("term")).toBe("fight club")
    expect(header).toBe(apiKey)
    // A missing `id` marks a candidate not in the library; an existing entry carries it.
    expect(results[0]).toMatchObject({ tmdbId: 550, title: "Fight Club", year: 1999 })
    expect(results[0]).not.toHaveProperty("id")
    expect(results[1]).toMatchObject({ id: 77, tmdbId: 1700 })
    // Unmodeled keys (images, ratings) are dropped.
    expect(results[0]).not.toHaveProperty("images")
    expect(results[0]).not.toHaveProperty("ratings")
  })

  it("adds a movie by tmdbId: looks it up, merges the add fields, posts, returns the movie", async () => {
    let lookupUrl: URL | undefined
    let body: Record<string, unknown> | undefined
    server.use(
      http.get(`${movieUrl}/lookup/tmdb`, ({ request }) => {
        lookupUrl = new URL(request.url)
        return HttpResponse.json(movieLookupTmdbFixture)
      }),
      http.post(movieUrl, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...movieFixture, id: 7 })
      }),
    )

    const added = successOf(
      await runExit((radarr) =>
        radarr.movie.add({ tmdbId: 550, qualityProfileId: 4, rootFolderPath: "/movies" }),
      ),
    )

    // The tmdbId rides the lookup query string.
    expect(lookupUrl?.searchParams.get("tmdbId")).toBe("550")
    // The post spreads the looked-up resource, then layers the add fields over it;
    // `monitored`/`minimumAvailability` default, and the add never starts a search.
    expect(body).toMatchObject({
      tmdbId: 550,
      title: "Fight Club",
      titleSlug: "fight-club-550",
      qualityProfileId: 4,
      rootFolderPath: "/movies",
      monitored: true,
      minimumAvailability: "released",
      addOptions: { searchForMovie: false },
    })
    // The created movie decodes from the POST response.
    expect(added.id).toBe(7)
  })

  it("removes a movie by id, sending deleteFiles on the query string and resolving void", async () => {
    let url: URL | undefined
    server.use(
      http.delete(`${movieUrl}/7`, ({ request }) => {
        url = new URL(request.url)
        return new HttpResponse(null, { status: 200 })
      }),
    )

    const result = successOf(
      await runExit((radarr) => radarr.movie.remove(7, { deleteFiles: true })),
    )

    expect(result).toBeUndefined()
    expect(url?.searchParams.get("deleteFiles")).toBe("true")
  })
})
