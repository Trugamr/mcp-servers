import { Sonarr, type SonarrService } from "@trugamr/sonarr/effect"
import { Cause, Effect, Exit, JSONSchema, Option, Schema, SchemaAST } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  createTag,
  getSeries,
  getSystemStatus,
  listEpisodes,
  listSeries,
  SonarrToolkit,
} from "../tools.js"
import { episodeFixture } from "./fixtures/episode.js"
import { seriesFixture } from "./fixtures/series.js"
import { systemStatusFixture } from "./fixtures/system-status.js"
import { tagFixture } from "./fixtures/tag.js"

const baseUrl = "http://sonarr.test"
const apiKey = "test-api-key"
/** Absolute URL for a v3 API path on the mocked instance, e.g. `apiUrl("/series")`. */
const apiUrl = (path: string) => `${baseUrl}/api/v3${path}`
const statusUrl = apiUrl("/system/status")
const TestSonarr = Sonarr.layer({ baseUrl, apiKey })

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** Drive a handler with a Sonarr client pointed at the mocked instance. */
const run = <A, E>(build: (sonarr: SonarrService) => Effect.Effect<A, E>) =>
  Effect.flatMap(Sonarr, build).pipe(Effect.provide(TestSonarr))

const mkSeries = (o: Record<string, unknown>) => ({ ...seriesFixture, ...o })
const mkEp = (o: Record<string, unknown>) => ({ ...episodeFixture, ...o })
const ids = (r: { items: ReadonlyArray<{ id: number }> }) => r.items.map((i) => i.id).sort()

describe("get_system_status tool handler", () => {
  it("returns the decoded status on success", async () => {
    server.use(http.get(statusUrl, () => HttpResponse.json(systemStatusFixture)))

    const status = await Effect.runPromise(run(getSystemStatus))

    expect(status.appName).toBe("Sonarr")
    expect(status.version).toBe(systemStatusFixture.version)
  })

  it("maps a SonarrError into the tool-error shape (401 → SonarrResponseError)", async () => {
    server.use(http.get(statusUrl, () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(run(getSystemStatus))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.isSome(failure)).toBe(true)
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "SonarrResponseError",
      message: "Sonarr returned HTTP 401",
    })
  })
})

describe("library tool handlers", () => {
  it("list_series returns the decoded series", async () => {
    server.use(http.get(apiUrl("/series"), () => HttpResponse.json([seriesFixture])))

    const { items } = await Effect.runPromise(run(listSeries))

    expect(items[0]?.title).toBe(seriesFixture.title)
  })

  it("get_series interpolates the id into the request path", async () => {
    server.use(http.get(apiUrl("/series/5"), () => HttpResponse.json(seriesFixture)))

    const series = await Effect.runPromise(run((sonarr) => getSeries(sonarr, 5)))

    expect(series.id).toBe(5)
  })

  it("list_episodes forwards seriesId and seasonNumber as query params", async () => {
    let url: URL | undefined
    server.use(
      http.get(apiUrl("/episode"), ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json([episodeFixture])
      }),
    )

    await Effect.runPromise(run((sonarr) => listEpisodes(sonarr, { seriesId: 5, seasonNumber: 2 })))

    expect(url?.searchParams.get("seriesId")).toBe("5")
    expect(url?.searchParams.get("seasonNumber")).toBe("2")
  })

  it("create_tag posts the label and returns the created tag", async () => {
    server.use(http.post(apiUrl("/tag"), () => HttpResponse.json(tagFixture)))

    const tag = await Effect.runPromise(run((sonarr) => createTag(sonarr, "anime")))

    expect(tag.label).toBe(tagFixture.label)
  })

  it("maps a SonarrError into the tool-error shape (401 on list_series)", async () => {
    server.use(http.get(apiUrl("/series"), () => new HttpResponse(null, { status: 401 })))

    const exit = await Effect.runPromiseExit(run(listSeries))

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toEqual({
      _tag: "SonarrResponseError",
      message: "Sonarr returned HTTP 401",
    })
  })
})

describe("list_series query surface", () => {
  const mockSeries = (data: ReadonlyArray<unknown>) =>
    server.use(http.get(apiUrl("/series"), () => HttpResponse.json(data)))

  // Three series exercising every filterable field; statistics/ratings only on #3.
  const library = [
    mkSeries({
      id: 1,
      title: "Alpha",
      year: 2010,
      status: "continuing",
      monitored: true,
      qualityProfileId: 1,
      seriesType: "standard",
      tags: [5],
      genres: ["Drama", "Crime"],
      network: "HBO",
    }),
    mkSeries({
      id: 2,
      title: "Bravo",
      year: 2016,
      status: "ended",
      monitored: false,
      qualityProfileId: 2,
      seriesType: "anime",
      tags: [],
      genres: ["Comedy"],
      network: "Netflix",
    }),
    mkSeries({
      id: 3,
      title: "Charlie",
      year: 2015,
      status: "ended",
      monitored: true,
      qualityProfileId: 1,
      seriesType: "standard",
      tags: [5, 7],
      genres: ["Drama"],
      network: "AMC",
      statistics: {
        seasonCount: 3,
        episodeFileCount: 10,
        episodeCount: 12,
        totalEpisodeCount: 12,
        sizeOnDisk: 1000,
        percentOfEpisodes: 83,
      },
      ratings: { votes: 100, value: 8.5 },
    }),
  ]

  it("caps the default page and returns a cursor for the next", async () => {
    mockSeries(
      Array.from({ length: 25 }, (_, i) =>
        mkSeries({ id: i + 1, title: `S${String(i).padStart(2, "0")}` }),
      ),
    )

    const first = await Effect.runPromise(run((s) => listSeries(s)))
    expect(first.items.length).toBe(20)
    expect(first.totalRecords).toBe(25)
    expect(first.nextCursor).toBeDefined()

    const second = await Effect.runPromise(
      run((s) => listSeries(s, { page: { cursor: first.nextCursor } })),
    )
    expect(second.items.length).toBe(5)
    expect(second.nextCursor).toBeUndefined()
  })

  it("honors the page size hint", async () => {
    mockSeries(Array.from({ length: 5 }, (_, i) => mkSeries({ id: i + 1, title: `S${i}` })))

    const r = await Effect.runPromise(run((s) => listSeries(s, { page: { size: 2 } })))

    expect(r.items.length).toBe(2)
    expect(r.nextCursor).toBeDefined()
  })

  it("fails with a tool error on an invalid cursor (no fetch attempted)", async () => {
    const exit = await Effect.runPromiseExit(
      run((s) => listSeries(s, { page: { cursor: "not-a-valid-cursor" } })),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none()
    expect(Option.getOrThrow(failure)).toMatchObject({ _tag: "InvalidCursor" })
  })

  it("filters by status, monitored, year range, and type negation", async () => {
    mockSeries(library)

    expect(
      ids(
        await Effect.runPromise(
          run((s) => listSeries(s, { filter: { status: { in: ["ended"] } } })),
        ),
      ),
    ).toEqual([2, 3])
    expect(
      ids(
        await Effect.runPromise(run((s) => listSeries(s, { filter: { monitored: { eq: true } } }))),
      ),
    ).toEqual([1, 3])
    expect(
      ids(
        await Effect.runPromise(
          run((s) => listSeries(s, { filter: { year: { gte: 2015, lte: 2016 } } })),
        ),
      ),
    ).toEqual([2, 3])
    expect(
      ids(
        await Effect.runPromise(
          run((s) => listSeries(s, { filter: { seriesType: { ne: "anime" } } })),
        ),
      ),
    ).toEqual([1, 3])
  })

  it("filters on fields dropped from the summary (tag, genre)", async () => {
    mockSeries(library)

    const tagged = await Effect.runPromise(
      run((s) => listSeries(s, { filter: { tag: { hasAny: [7] } } })),
    )
    expect(tagged.items.map((i) => i.id)).toEqual([3])

    const drama = await Effect.runPromise(
      run((s) => listSeries(s, { filter: { genre: { hasAll: ["Drama", "Crime"] } } })),
    )
    expect(drama.items.map((i) => i.id)).toEqual([1])
  })

  it("sorts by multiple fields and defaults to title ascending", async () => {
    mockSeries(library)

    const byYearDesc = await Effect.runPromise(
      run((s) => listSeries(s, { sort: [{ field: "year", order: "desc" }, { field: "title" }] })),
    )
    expect(byYearDesc.items.map((i) => i.id)).toEqual([2, 3, 1])

    const def = await Effect.runPromise(run((s) => listSeries(s)))
    expect(def.items.map((i) => i.title)).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  it("projects lean summaries by default and re-adds heavy blocks via include", async () => {
    mockSeries(library)

    const def = await Effect.runPromise(run((s) => listSeries(s)))
    const first = def.items[0]
    expect(first?.title).toBeDefined()
    expect(first).not.toHaveProperty("seasons")
    expect(first).not.toHaveProperty("statistics")
    expect(first).not.toHaveProperty("ratings")
    expect(first).not.toHaveProperty("overview")

    const withStats = await Effect.runPromise(
      run((s) =>
        listSeries(s, {
          filter: { status: { in: ["ended"] }, monitored: { eq: true } },
          include: ["statistics", "ratings"],
        }),
      ),
    )
    expect(withStats.items).toHaveLength(1)
    expect(withStats.items[0]).toHaveProperty("statistics")
    expect(withStats.items[0]).toHaveProperty("ratings")
    expect(withStats.items[0]).not.toHaveProperty("seasons")
  })

  it("returns an empty page when nothing matches", async () => {
    mockSeries(library)

    const none = await Effect.runPromise(
      run((s) => listSeries(s, { filter: { title: { contains: "zzzzz" } } })),
    )

    expect(none.items).toEqual([])
    expect(none.totalRecords).toBe(0)
    expect(none.nextCursor).toBeUndefined()
  })
})

describe("list_episodes query surface", () => {
  const mockEp = (data: ReadonlyArray<unknown>) =>
    server.use(http.get(apiUrl("/episode"), () => HttpResponse.json(data)))

  const eps = [
    mkEp({
      id: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Pilot",
      hasFile: true,
      monitored: true,
      airDateUtc: "2010-01-01T00:00:00Z",
    }),
    mkEp({
      id: 2,
      seasonNumber: 1,
      episodeNumber: 2,
      title: "Two",
      hasFile: false,
      monitored: true,
      airDateUtc: "2010-01-08T00:00:00Z",
    }),
    mkEp({
      id: 3,
      seasonNumber: 2,
      episodeNumber: 1,
      title: "Future",
      hasFile: false,
      monitored: true,
      airDateUtc: "2999-01-01T00:00:00Z",
    }),
  ]

  it("filters by missing and hasAired conveniences", async () => {
    mockEp(eps)

    expect(
      ids(
        await Effect.runPromise(
          run((s) => listEpisodes(s, { seriesId: 5, filter: { missing: true } })),
        ),
      ),
    ).toEqual([2, 3])
    expect(
      ids(
        await Effect.runPromise(
          run((s) => listEpisodes(s, { seriesId: 5, filter: { hasAired: true } })),
        ),
      ),
    ).toEqual([1, 2])
    expect(
      ids(
        await Effect.runPromise(
          run((s) => listEpisodes(s, { seriesId: 5, filter: { missing: true, hasAired: true } })),
        ),
      ),
    ).toEqual([2])
  })

  it("filters by airDate range, sorts by airDate desc, and keeps overview", async () => {
    mockEp(eps.map((e, i) => ({ ...e, overview: `ov${i}` })))

    const win = await Effect.runPromise(
      run((s) =>
        listEpisodes(s, {
          seriesId: 5,
          filter: { airDate: { gte: "2010-01-05T00:00:00Z", lt: "2999-01-01T00:00:00Z" } },
        }),
      ),
    )
    expect(win.items.map((i) => i.id)).toEqual([2])

    const sorted = await Effect.runPromise(
      run((s) => listEpisodes(s, { seriesId: 5, sort: [{ field: "airDate", order: "desc" }] })),
    )
    expect(sorted.items.map((i) => i.id)).toEqual([3, 2, 1])
    expect(sorted.items[0]).toHaveProperty("overview")
  })
})

describe("tool inputSchema derivation", () => {
  it("derives list_series parameters as nested objects with no anyOf unions", () => {
    const json = JSON.stringify(JSONSchema.make(SonarrToolkit.tools.list_series.parametersSchema))

    expect(json).not.toContain("anyOf")
    expect(json).toContain("filter")
    expect(json).toContain("hasAny") // nested array-membership operator object derived
    expect(json).toContain("gte") // nested range operator object derived
  })

  it("derives list_episodes parameters without throwing", () => {
    expect(() => JSONSchema.make(SonarrToolkit.tools.list_episodes.parametersSchema)).not.toThrow()
  })
})

// MCP requires a tool result's `structuredContent` to be a JSON object, and
// @effect/ai drops the *encoded* success value straight into that field. So a
// tool's success schema must encode to an object — a struct (`TypeLiteral`) — or
// to void, which @effect/ai omits. The encoded AST is what matters: a schema with
// nullable fields is a `Transformation` until encoded. A bare array (`TupleType`)
// is the shape clients reject with `expected: "record"`.
const objectShapedSuccess = ["TypeLiteral", "VoidKeyword"]

describe("tool success schemas are MCP-valid structured content", () => {
  for (const tool of Object.values(SonarrToolkit.tools)) {
    it(`${tool.name} encodes to an object (or void)`, () => {
      const encoded = SchemaAST.encodedAST(tool.successSchema.ast)
      expect(objectShapedSuccess.includes(encoded._tag)).toBe(true)
    })
  }
})

describe("structured content round-trip", () => {
  it("list_series encodes to a JSON object, not a bare array", async () => {
    server.use(http.get(apiUrl("/series"), () => HttpResponse.json([seriesFixture])))

    const result = await Effect.runPromise(run(listSeries))
    const encoded = Schema.encodeSync(SonarrToolkit.tools.list_series.successSchema)(result)

    expect(typeof encoded).toBe("object")
    expect(Array.isArray(encoded)).toBe(false)
  })
})
