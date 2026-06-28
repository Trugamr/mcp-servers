import { type Movie, Radarr, type RadarrService } from "@trugamr/radarr/effect"
import { Cause, Effect, Exit, Option, Schema, SchemaAST } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  addMovie,
  createQualityProfile,
  deleteQualityProfile,
  getQualityProfile,
  getSystemStatus,
  grabRelease,
  listLanguages,
  listMovies,
  listQualityProfiles,
  listQueue,
  listRootFolders,
  lookupMovie,
  type MovieListArguments,
  type QueueListArguments,
  RadarrToolkit,
  type ReleaseSearchArguments,
  removeMovie,
  searchReleases,
  updateQualityProfile,
} from "../tools.js"
import { languagesFixture } from "./fixtures/language.js"
import { movieFixture } from "./fixtures/movie.js"
import { movieLookupFixture, movieLookupTmdbFixture } from "./fixtures/movie-lookup.js"
import { qualityProfilesFixture } from "./fixtures/quality-profile.js"
import { queuePageFixture } from "./fixtures/queue.js"
import { releasesFixture } from "./fixtures/release.js"
import { rootFoldersFixture } from "./fixtures/root-folder.js"
import { systemStatusFixture } from "./fixtures/system-status.js"

const baseUrl = "http://radarr.test"
const apiKey = "test-api-key"
/** Absolute URL for a v3 API path on the mocked instance, e.g. `apiUrl("/movie")`. */
const apiUrl = (path: string) => `${baseUrl}/api/v3${path}`
const statusUrl = apiUrl("/system/status")
const TestRadarr = Radarr.layer({ baseUrl, apiKey })

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** Drive a handler with a Radarr client pointed at the mocked instance. */
const run = <A, E>(build: (radarr: RadarrService) => Effect.Effect<A, E>) =>
  Effect.flatMap(Radarr, build).pipe(Effect.provide(TestRadarr))

const makeMovie = (overrides: Partial<Movie> = {}) => ({ ...movieFixture, ...overrides })
const ids = (r: { items: ReadonlyArray<{ id: number }> }) => r.items.map((item) => item.id).sort()
const guids = (r: { items: ReadonlyArray<{ guid: string }> }) => r.items.map((item) => item.guid)

describe("get_system_status tool handler", () => {
  it("returns the decoded status on success", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = await Effect.runPromise(run(getSystemStatus))

    expect(status).toMatchObject({ appName: "Radarr", version: systemStatusFixture.version })
  })

  it("maps a RadarrError into the tool-error shape (401 → RadarrResponseError)", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(run(getSystemStatus))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "RadarrResponseError",
      message: "Radarr returned HTTP 401",
    })
  })
})

describe("library + release tool handlers", () => {
  it("list_movies returns the decoded movies wrapped as items", async () => {
    server.use(http.get(apiUrl("/movie"), () => HttpResponse.json([movieFixture])))

    const { items } = await Effect.runPromise(run((radarr) => listMovies(radarr)))

    expect(items[0]).toMatchObject({
      title: movieFixture.title,
      tmdbId: movieFixture.tmdbId,
      imdbId: movieFixture.imdbId,
    })
  })

  it("search_releases forwards movieId and returns candidates carrying guid + indexerId", async () => {
    let url: URL | undefined
    server.use(
      http.get(apiUrl("/release"), ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json(releasesFixture)
      }),
    )

    const { items } = await Effect.runPromise(
      run((radarr) => searchReleases(radarr, { movieId: 123 })),
    )

    expect(url?.searchParams.get("movieId")).toBe("123")
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ guid: "https://indexer.test/abc", indexerId: 2 })
    // downloadUrl embeds an API key; it must never reach the model's context.
    expect(items[0]).not.toHaveProperty("downloadUrl")
  })

  it("grab_release posts guid + indexerId and acknowledges with accepted + title", async () => {
    let body: unknown
    server.use(
      http.post(apiUrl("/release"), async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 201 })
      }),
    )

    const result = await Effect.runPromise(
      run((radarr) => grabRelease(radarr, { guid: "abc", indexerId: 2, title: "The Dark Knight" })),
    )

    // Only the grab keys go on the wire; accepted + title come back from the handler.
    expect(body).toEqual({ guid: "abc", indexerId: 2 })
    expect(result).toEqual({ accepted: true, guid: "abc", indexerId: 2, title: "The Dark Knight" })
  })

  it("grab_release omits title from the acknowledgement when not provided", async () => {
    server.use(http.post(apiUrl("/release"), () => new HttpResponse(null, { status: 201 })))

    const result = await Effect.runPromise(
      run((radarr) => grabRelease(radarr, { guid: "abc", indexerId: 2 })),
    )

    expect(result).toEqual({ accepted: true, guid: "abc", indexerId: 2 })
    expect(result).not.toHaveProperty("title")
  })

  it("list_queue unwraps the paginated records into items, carrying downloadId", async () => {
    server.use(http.get(apiUrl("/queue"), () => HttpResponse.json(queuePageFixture)))

    const { items } = await Effect.runPromise(run((radarr) => listQueue(radarr)))

    expect(items).toHaveLength(1)
    expect(items[0]?.trackedDownloadState).toBe("downloading")
    // downloadId is the handle the agent polls by after a grab.
    expect(items[0]?.downloadId).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90")
  })

  it("maps a RadarrError into the tool-error shape (401 on list_movies)", async () => {
    server.use(http.get(apiUrl("/movie"), () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(run((radarr) => listMovies(radarr)))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "RadarrResponseError",
      message: "Radarr returned HTTP 401",
    })
  })
})

describe("add-funnel tool handlers", () => {
  it("lookup_movie returns candidates wrapped as items, carrying tmdbId and the library id", async () => {
    let url: URL | undefined
    server.use(
      http.get(apiUrl("/movie/lookup"), ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json(movieLookupFixture)
      }),
    )

    const { items } = await Effect.runPromise(run((r) => lookupMovie(r, "fight club")))

    expect(url?.searchParams.get("term")).toBe("fight club")
    // A missing id tells the agent the candidate isn't in the library yet; an existing
    // entry carries its library id. status + runtime ride along for the add decision.
    expect(items[0]).toMatchObject({
      tmdbId: 550,
      title: "Fight Club",
      year: 1999,
      status: "released",
      runtime: 139,
    })
    expect(items[0]).not.toHaveProperty("id")
    expect(items[1]).toMatchObject({ id: 77, tmdbId: 1700 })
    // Lean projection drops the heavy fields the lookup carries.
    expect(items[0]).not.toHaveProperty("images")
    expect(items[0]).not.toHaveProperty("titleSlug")
  })

  it("add_movie looks up by tmdbId, posts the merged body, and returns a lean movie summary", async () => {
    let lookupUrl: URL | undefined
    let body: Record<string, unknown> | undefined
    server.use(
      http.get(apiUrl("/movie/lookup/tmdb"), ({ request }) => {
        lookupUrl = new URL(request.url)
        return HttpResponse.json(movieLookupTmdbFixture)
      }),
      http.post(apiUrl("/movie"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...movieFixture, id: 7, tmdbId: 550, title: "Fight Club" })
      }),
    )

    const result = await Effect.runPromise(
      run((r) => addMovie(r, { tmdbId: 550, qualityProfileId: 4, rootFolderPath: "/movies" })),
    )

    expect(lookupUrl?.searchParams.get("tmdbId")).toBe("550")
    // The looked-up resource is spread, then the add fields layer over it; the add
    // never starts a release search.
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
    // The created movie comes back as the lean MovieSummary (no overview).
    expect(result).toMatchObject({ id: 7, tmdbId: 550, title: "Fight Club" })
    expect(result).not.toHaveProperty("overview")
  })

  it("remove_movie issues a DELETE with the flags and echoes the removed id", async () => {
    let url: URL | undefined
    server.use(
      http.delete(apiUrl("/movie/7"), ({ request }) => {
        url = new URL(request.url)
        return new HttpResponse(null, { status: 200 })
      }),
    )

    const result = await Effect.runPromise(run((r) => removeMovie(r, { id: 7, deleteFiles: true })))

    expect(url?.searchParams.get("deleteFiles")).toBe("true")
    expect(result).toEqual({ id: 7 })
  })

  it("list_quality_profiles returns lean id + name items", async () => {
    server.use(http.get(apiUrl("/qualityprofile"), () => HttpResponse.json(qualityProfilesFixture)))

    const { items } = await Effect.runPromise(run((r) => listQualityProfiles(r)))

    expect(items).toEqual([
      { id: 1, name: "Any" },
      { id: 4, name: "HD-1080p" },
    ])
  })

  it("list_root_folders returns the folders wrapped as items", async () => {
    server.use(http.get(apiUrl("/rootfolder"), () => HttpResponse.json(rootFoldersFixture)))

    const { items } = await Effect.runPromise(run((r) => listRootFolders(r)))

    expect(items[0]).toMatchObject({ id: 1, path: "/movies", accessible: true })
  })

  it("maps a RadarrError into the tool-error shape (lookup 401 on add_movie)", async () => {
    server.use(
      http.get(apiUrl("/movie/lookup/tmdb"), () => new HttpResponse(null, { status: 401 })),
    )

    const exit = await Effect.runPromiseExit(
      run((r) => addMovie(r, { tmdbId: 550, qualityProfileId: 1, rootFolderPath: "/movies" })),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "RadarrResponseError",
      message: "Radarr returned HTTP 401",
    })
  })
})

describe("quality profile + language config tool handlers", () => {
  const profileUrl = apiUrl("/qualityprofile")

  it("get_quality_profile returns the full profile by id", async () => {
    server.use(http.get(`${profileUrl}/4`, () => HttpResponse.json(qualityProfilesFixture[1])))

    const profile = await Effect.runPromise(run((r) => getQualityProfile(r, 4)))

    expect(profile).toMatchObject({
      id: 4,
      name: "HD-1080p",
      cutoff: 7,
      language: { id: 1, name: "English" },
      formatItems: [{ format: 2, score: 0 }],
    })
  })

  it("create_quality_profile posts the body and returns the created profile", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post(profileUrl, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...qualityProfilesFixture[1], id: 9, name: "Custom" })
      }),
    )

    const created = await Effect.runPromise(
      run((r) =>
        createQualityProfile(r, {
          name: "Custom",
          upgradeAllowed: true,
          cutoff: 7,
          minFormatScore: 0,
          cutoffFormatScore: 0,
          items: [{ quality: { id: 7, name: "Bluray-1080p" }, allowed: true }],
        }),
      ),
    )

    expect(body).toMatchObject({ name: "Custom", cutoff: 7 })
    expect(created).toMatchObject({ id: 9, name: "Custom" })
  })

  it("update_quality_profile merges the patch over the fetched profile, preserving fields", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      // The GET carries an unmodeled `appProfileId` the typed schema doesn't know about.
      http.get(`${profileUrl}/4`, () =>
        HttpResponse.json({ ...qualityProfilesFixture[1], appProfileId: 1 }),
      ),
      http.put(`${profileUrl}/4`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...qualityProfilesFixture[1], upgradeAllowed: false })
      }),
    )

    const updated = await Effect.runPromise(
      run((r) => updateQualityProfile(r, { id: 4, profile: { upgradeAllowed: false } })),
    )

    // The PUT body overlays the patch onto the full fetched resource — id, the untouched
    // cutoff, and the unmodeled appProfileId all survive.
    expect(body).toMatchObject({ id: 4, upgradeAllowed: false, cutoff: 7, appProfileId: 1 })
    expect(updated.upgradeAllowed).toBe(false)
  })

  it("delete_quality_profile echoes the deleted id", async () => {
    server.use(http.delete(`${profileUrl}/4`, () => new HttpResponse(null, { status: 200 })))

    const result = await Effect.runPromise(run((r) => deleteQualityProfile(r, 4)))

    expect(result).toEqual({ id: 4 })
  })

  it("list_languages returns the languages wrapped as items", async () => {
    server.use(http.get(apiUrl("/language"), () => HttpResponse.json(languagesFixture)))

    const { items } = await Effect.runPromise(run((r) => listLanguages(r)))

    expect(items).toContainEqual({ id: 1, name: "English" })
  })
})

describe("list_movies query surface", () => {
  const mockMovies = (data: ReadonlyArray<unknown>) =>
    server.use(http.get(apiUrl("/movie"), () => HttpResponse.json(data)))

  // Three movies exercising every filterable field.
  const library = [
    makeMovie({
      id: 1,
      title: "Alpha",
      year: 2010,
      status: "released",
      monitored: true,
      hasFile: true,
      qualityProfileId: 1,
      studio: "HBO",
      genres: ["Drama", "Crime"],
    }),
    makeMovie({
      id: 2,
      title: "Bravo",
      year: 2016,
      status: "announced",
      monitored: false,
      hasFile: false,
      qualityProfileId: 2,
      studio: "Netflix",
      genres: ["Comedy"],
    }),
    makeMovie({
      id: 3,
      title: "Charlie",
      year: 2015,
      status: "released",
      monitored: true,
      hasFile: false,
      qualityProfileId: 1,
      studio: "AMC",
      genres: ["Drama"],
    }),
  ]

  beforeEach(() => mockMovies(library))

  // Run list_movies with one filter and return the matching ids (sorted).
  const movieIds = (filter: MovieListArguments["filter"]) =>
    Effect.runPromise(run((r) => listMovies(r, { filter }))).then(ids)

  it("caps the default page and returns a cursor for the next", async () => {
    mockMovies(
      Array.from({ length: 25 }, (_, index) =>
        makeMovie({ id: index + 1, title: `M${String(index).padStart(2, "0")}` }),
      ),
    )

    const first = await Effect.runPromise(run((r) => listMovies(r)))
    expect(first.items.length).toBe(20)
    expect(first.totalRecords).toBe(25)
    expect(first.nextCursor).toBeDefined()

    const second = await Effect.runPromise(
      run((r) => listMovies(r, { page: { cursor: first.nextCursor } })),
    )
    expect(second.items.length).toBe(5)
    expect(second.nextCursor).toBeUndefined()
  })

  it("fails with a tool error on an invalid cursor (no fetch attempted)", async () => {
    const exit = await Effect.runPromiseExit(
      run((r) => listMovies(r, { page: { cursor: "not-a-valid-cursor" } })),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toMatchObject({ _tag: "InvalidCursor" })
  })

  it("filters by status, monitored, hasFile, and year range", async () => {
    expect(await movieIds({ status: { eq: "released" } })).toEqual([1, 3])
    expect(await movieIds({ monitored: { eq: true } })).toEqual([1, 3])
    expect(await movieIds({ hasFile: { eq: false } })).toEqual([2, 3])
    expect(await movieIds({ year: { gte: 2015, lte: 2016 } })).toEqual([2, 3])
  })

  // Library genres: Alpha [Drama, Crime], Bravo [Comedy], Charlie [Drama].
  it("filters genres with set semantics (existential positives, universal negatives)", async () => {
    expect(await movieIds({ genres: { contains: "drama" } })).toEqual([1, 3])
    expect(await movieIds({ genres: { eq: "Comedy" } })).toEqual([2])
    expect(await movieIds({ genres: { in: ["Crime", "Comedy"] } })).toEqual([1, 2])
    // Negatives exclude any item carrying the genre — not "some other genre differs".
    expect(await movieIds({ genres: { ne: "Drama" } })).toEqual([2])
    expect(await movieIds({ genres: { nin: ["Drama"] } })).toEqual([2])
  })

  it("sorts by year desc then title, and defaults to title ascending", async () => {
    const byYearDesc = await Effect.runPromise(
      run((r) => listMovies(r, { sort: [{ field: "year", order: "desc" }, { field: "title" }] })),
    )
    expect(byYearDesc.items.map((item) => item.id)).toEqual([2, 3, 1])

    const defaultResult = await Effect.runPromise(run((r) => listMovies(r)))
    expect(defaultResult.items.map((item) => item.title)).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  it("projects lean summaries: surfaces genres, drops overview", async () => {
    const result = await Effect.runPromise(run((r) => listMovies(r)))
    for (const item of result.items) {
      expect(item).not.toHaveProperty("overview")
    }
    // Default title-ascending order: [Alpha, Bravo, Charlie]; genres rides along for
    // genre-aware filtering/selection.
    expect(result.items[0]).toMatchObject({ genres: ["Drama", "Crime"] })
  })
})

describe("search_releases query surface", () => {
  beforeEach(() =>
    server.use(http.get(apiUrl("/release"), () => HttpResponse.json(releasesFixture))),
  )

  // Search releases for movie 5 with the given query and return the guids in result order.
  const searchGuids = (query: Omit<ReleaseSearchArguments, "movieId"> = {}) =>
    Effect.runPromise(run((r) => searchReleases(r, { movieId: 5, ...query }))).then(guids)

  it("filters by codec via the title (the 1080p HEVC case)", async () => {
    expect(
      await searchGuids({ filter: { resolution: { eq: 1080 }, title: { contains: "hevc" } } }),
    ).toEqual(["https://indexer.test/abc"])
  })

  it("filters by protocol and approved", async () => {
    expect(await searchGuids({ filter: { protocol: { eq: "usenet" } } })).toEqual(["usenet-xyz"])
    expect(await searchGuids({ filter: { approved: { eq: true } } })).toEqual([
      "https://indexer.test/abc",
    ])
  })

  it("sorts by seeders descending (usenet's missing seeders sort as 0, last)", async () => {
    expect(await searchGuids({ sort: [{ field: "seeders", order: "desc" }] })).toEqual([
      "https://indexer.test/abc",
      "usenet-xyz",
    ])
  })

  it("keeps Radarr's order when no sort is given", async () => {
    expect(await searchGuids()).toEqual(["https://indexer.test/abc", "usenet-xyz"])
  })
})

describe("list_queue query surface", () => {
  beforeEach(() =>
    server.use(http.get(apiUrl("/queue"), () => HttpResponse.json(queuePageFixture))),
  )

  // Run list_queue with one filter and return the matching records.
  const queueItems = (filter: QueueListArguments["filter"]) =>
    Effect.runPromise(run((r) => listQueue(r, { filter }))).then((result) => result.items)

  it("filters by status and movieId", async () => {
    expect(await queueItems({ status: { eq: "downloading" } })).toHaveLength(1)
    expect(await queueItems({ status: { eq: "paused" } })).toHaveLength(0)
    expect(await queueItems({ movieId: { eq: 1 } })).toHaveLength(1)
  })

  it("filters by downloadId and the queue record id — the post-grab tracking keys", async () => {
    const hash = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
    expect(await queueItems({ downloadId: { eq: hash } })).toHaveLength(1)
    expect(await queueItems({ downloadId: { eq: "nope" } })).toHaveLength(0)
    expect(await queueItems({ id: { eq: 101 } })).toHaveLength(1)
    expect(await queueItems({ id: { eq: 999 } })).toHaveLength(0)
  })
})

// MCP requires a tool result's `structuredContent` to be a JSON object, and
// @effect/ai drops the *encoded* success value straight into that field. So every
// tool's success schema must encode to a struct (`TypeLiteral`) — never a bare array
// or void.
const objectShapedSuccess = ["TypeLiteral"]

describe("tool success schemas are MCP-valid structured content", () => {
  for (const tool of Object.values(RadarrToolkit.tools)) {
    it(`${tool.name} encodes to an object`, () => {
      const encoded = SchemaAST.encodedAST(tool.successSchema.ast)
      expect(objectShapedSuccess.includes(encoded._tag)).toBe(true)
    })
  }
})

describe("structured content round-trip", () => {
  it("list_movies encodes to a JSON object, not a bare array", async () => {
    server.use(http.get(apiUrl("/movie"), () => HttpResponse.json([movieFixture])))

    const result = await Effect.runPromise(run((r) => listMovies(r)))
    const encoded = Schema.encodeSync(RadarrToolkit.tools.list_movies.successSchema)(result)

    expect(typeof encoded).toBe("object")
    expect(Array.isArray(encoded)).toBe(false)
  })
})
