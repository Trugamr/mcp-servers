import { type Movie, Radarr, type RadarrService } from "@trugamr/radarr/effect"
import { Cause, Effect, Exit, Option, Schema, SchemaAST } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  getSystemStatus,
  grabRelease,
  listMovies,
  listQueue,
  RadarrToolkit,
  searchReleases,
} from "../tools.js"
import { movieFixture } from "./fixtures/movie.js"
import { queuePageFixture } from "./fixtures/queue.js"
import { releasesFixture } from "./fixtures/release.js"
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

    expect(items[0]).toMatchObject({ title: movieFixture.title, tmdbId: movieFixture.tmdbId })
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
  })

  it("grab_release posts guid + indexerId and echoes a confirmation with the title", async () => {
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

    // Only the grab keys go on the wire; the title is echoed back from the input.
    expect(body).toEqual({ guid: "abc", indexerId: 2 })
    expect(result).toEqual({ guid: "abc", indexerId: 2, title: "The Dark Knight" })
  })

  it("grab_release omits title from the confirmation when not provided", async () => {
    server.use(http.post(apiUrl("/release"), () => new HttpResponse(null, { status: 201 })))

    const result = await Effect.runPromise(
      run((radarr) => grabRelease(radarr, { guid: "abc", indexerId: 2 })),
    )

    expect(result).toEqual({ guid: "abc", indexerId: 2 })
    expect(result).not.toHaveProperty("title")
  })

  it("list_queue unwraps the paginated records into items", async () => {
    server.use(http.get(apiUrl("/queue"), () => HttpResponse.json(queuePageFixture)))

    const { items } = await Effect.runPromise(run((radarr) => listQueue(radarr)))

    expect(items).toHaveLength(1)
    expect(items[0]?.trackedDownloadState).toBe("downloading")
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
    }),
  ]

  beforeEach(() => mockMovies(library))

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
    expect(
      ids(
        await Effect.runPromise(
          run((r) => listMovies(r, { filter: { status: { eq: "released" } } })),
        ),
      ),
    ).toEqual([1, 3])
    expect(
      ids(
        await Effect.runPromise(run((r) => listMovies(r, { filter: { monitored: { eq: true } } }))),
      ),
    ).toEqual([1, 3])
    expect(
      ids(
        await Effect.runPromise(run((r) => listMovies(r, { filter: { hasFile: { eq: false } } }))),
      ),
    ).toEqual([2, 3])
    expect(
      ids(
        await Effect.runPromise(
          run((r) => listMovies(r, { filter: { year: { gte: 2015, lte: 2016 } } })),
        ),
      ),
    ).toEqual([2, 3])
  })

  it("sorts by year desc then title, and defaults to title ascending", async () => {
    const byYearDesc = await Effect.runPromise(
      run((r) => listMovies(r, { sort: [{ field: "year", order: "desc" }, { field: "title" }] })),
    )
    expect(byYearDesc.items.map((item) => item.id)).toEqual([2, 3, 1])

    const defaultResult = await Effect.runPromise(run((r) => listMovies(r)))
    expect(defaultResult.items.map((item) => item.title)).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  it("projects lean summaries: drops overview/genres", async () => {
    const result = await Effect.runPromise(run((r) => listMovies(r)))
    for (const item of result.items) {
      expect(item).not.toHaveProperty("overview")
      expect(item).not.toHaveProperty("genres")
    }
  })
})

describe("search_releases query surface", () => {
  beforeEach(() =>
    server.use(http.get(apiUrl("/release"), () => HttpResponse.json(releasesFixture))),
  )

  it("filters by codec via the title (the 1080p HEVC case)", async () => {
    const result = await Effect.runPromise(
      run((r) =>
        searchReleases(r, {
          movieId: 5,
          filter: { resolution: { eq: 1080 }, title: { contains: "hevc" } },
        }),
      ),
    )
    expect(guids(result)).toEqual(["https://indexer.test/abc"])
  })

  it("filters by protocol and approved", async () => {
    expect(
      guids(
        await Effect.runPromise(
          run((r) => searchReleases(r, { movieId: 5, filter: { protocol: { eq: "usenet" } } })),
        ),
      ),
    ).toEqual(["usenet-xyz"])
    expect(
      guids(
        await Effect.runPromise(
          run((r) => searchReleases(r, { movieId: 5, filter: { approved: { eq: true } } })),
        ),
      ),
    ).toEqual(["https://indexer.test/abc"])
  })

  it("sorts by seeders descending (usenet's missing seeders sort as 0, last)", async () => {
    const result = await Effect.runPromise(
      run((r) => searchReleases(r, { movieId: 5, sort: [{ field: "seeders", order: "desc" }] })),
    )
    expect(guids(result)).toEqual(["https://indexer.test/abc", "usenet-xyz"])
  })

  it("keeps Radarr's order when no sort is given", async () => {
    const result = await Effect.runPromise(run((r) => searchReleases(r, { movieId: 5 })))
    expect(guids(result)).toEqual(["https://indexer.test/abc", "usenet-xyz"])
  })
})

describe("list_queue query surface", () => {
  beforeEach(() =>
    server.use(http.get(apiUrl("/queue"), () => HttpResponse.json(queuePageFixture))),
  )

  it("filters by status and movieId", async () => {
    expect(
      (
        await Effect.runPromise(
          run((r) => listQueue(r, { filter: { status: { eq: "downloading" } } })),
        )
      ).items,
    ).toHaveLength(1)
    expect(
      (await Effect.runPromise(run((r) => listQueue(r, { filter: { status: { eq: "paused" } } }))))
        .items,
    ).toHaveLength(0)
    expect(
      (await Effect.runPromise(run((r) => listQueue(r, { filter: { movieId: { eq: 1 } } })))).items,
    ).toHaveLength(1)
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
