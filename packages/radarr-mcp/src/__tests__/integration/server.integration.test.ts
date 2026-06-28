import { McpSchema } from "@effect/ai"
import { callMcp } from "@trugamr/testkit/mcp"
import {
  injectRadarr,
  MOVIE_ROOT_FOLDER,
  RADARR_VERSION,
  type SeededMovie,
  seedMovie,
} from "@trugamr/testkit/radarr"
import { ConfigProvider, Effect, Exit, Layer, Schema, Scope } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { httpServerLive } from "../../server.js"

const host = "127.0.0.1"
const port = 38528
const endpoint = `http://${host}:${port}/mcp`

// Boot the real MCP HTTP server once, pointed at the Radarr the global setup
// resolved, and seed one real movie so list_movies/search_releases have a target.
// Building the layer binds the socket; closing the scope tears it down.
let scope: Scope.CloseableScope
let seeded: SeededMovie
beforeAll(async () => {
  const { baseUrl, apiKey } = injectRadarr()
  const config = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["RADARR_BASE_URL", baseUrl],
        ["RADARR_API_KEY", apiKey],
      ]),
    ),
  )
  const server = httpServerLive({ host, port }).pipe(Layer.provide(config))
  scope = Effect.runSync(Scope.make())
  await Effect.runPromise(Layer.buildWithScope(server, scope))
  seeded = await seedMovie()
})
afterAll(() => Effect.runPromise(Scope.close(scope, Exit.void)))

// Call a tool and decode the MCP envelope, so a malformed result fails the test.
const callTool = (name: string, toolArguments: Record<string, unknown>) =>
  callMcp(endpoint, "tools/call", { name, arguments: toolArguments }).then(
    Schema.decodeUnknownSync(McpSchema.CallToolResult),
  )

// List tools wrap their rows as `{ items }` — MCP structured content can't be a
// bare array — so unwrap that here instead of repeating the cast at each call site.
const itemsOf = <T = unknown>(structuredContent: unknown): ReadonlyArray<T> =>
  (structuredContent as { readonly items: ReadonlyArray<T> }).items

// One pipe per shape — the SDK suite already decodes the per-operation payloads, so
// these assert the MCP plumbing (transport, handler wiring, result encoding) rather
// than re-checking every field.
describe("radarr-mcp tools over Streamable HTTP, against a live Radarr", () => {
  it("get_system_status round-trips a decoded status (a no-arg GET)", async () => {
    const result = await callTool("get_system_status", {})

    expect(result.isError ?? false).toBe(false)
    expect(result.structuredContent).toMatchObject({ appName: "Radarr", version: RADARR_VERSION })
  })

  it("list_movies includes the seeded movie (a list GET)", async () => {
    const result = await callTool("list_movies", {})

    expect(result.isError ?? false).toBe(false)
    const items = itemsOf<{ readonly id: number }>(result.structuredContent)
    expect(items.some((entry) => entry.id === seeded.id)).toBe(true)
  })

  it("narrows list_movies to the seeded movie by title + year (the query surface)", async () => {
    const result = await callTool("list_movies", {
      filter: { title: { contains: "Unfortunate" }, year: { eq: 2004 } },
    })

    expect(result.isError ?? false).toBe(false)
    const items = itemsOf<{ readonly id: number }>(result.structuredContent)
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(seeded.id)
  })

  it("excludes the seeded movie when a filter rules it out (proves it filters, not echoes)", async () => {
    const result = await callTool("list_movies", { filter: { year: { gte: 2030 } } })

    expect(result.isError ?? false).toBe(false)
    expect(itemsOf(result.structuredContent)).toHaveLength(0)
  })

  it("search_releases reaches the indexer search and returns no candidates without indexers", async () => {
    // No indexers are configured on the booted instance, so the interactive search
    // is reachable and decodes but yields nothing — a real grab needs a real indexer.
    const result = await callTool("search_releases", { movieId: seeded.id })

    expect(result.isError ?? false).toBe(false)
    expect(itemsOf(result.structuredContent)).toEqual([])
  })

  it("list_queue returns an empty queue on a fresh instance", async () => {
    const result = await callTool("list_queue", {})

    expect(result.isError ?? false).toBe(false)
    expect(itemsOf(result.structuredContent)).toEqual([])
  })

  it("reports a typed tool error when grabbing an unknown release (isError over the wire)", async () => {
    const result = await callTool("grab_release", { guid: "does-not-exist", indexerId: 999 })

    expect(result.isError).toBe(true)
    // Failures encode the typed ToolError ({ _tag, message }) under structuredContent,
    // the same channel successes use — so assert on the tag, not a substring.
    expect(result.structuredContent).toMatchObject({ _tag: "RadarrResponseError" })
  })

  it("list_quality_profiles returns the default profiles as lean id + name items", async () => {
    const result = await callTool("list_quality_profiles", {})

    expect(result.isError ?? false).toBe(false)
    const items = itemsOf<Record<string, unknown>>(result.structuredContent)
    expect(items.length).toBeGreaterThan(0)
    // The lean projection returns just id + name, dropping the profile's quality list.
    expect(items[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) })
    expect(items[0]).not.toHaveProperty("items")
  })

  it("list_root_folders includes the seeded root folder", async () => {
    const result = await callTool("list_root_folders", {})

    expect(result.isError ?? false).toBe(false)
    const items = itemsOf<{ readonly path?: string }>(result.structuredContent)
    expect(items.some((folder) => folder.path === MOVIE_ROOT_FOLDER)).toBe(true)
  })

  it("lookup_movie finds a film by term, returning its projected fields", async () => {
    const result = await callTool("lookup_movie", { term: "Fight Club 1999" })

    expect(result.isError ?? false).toBe(false)
    const items = itemsOf<Record<string, unknown>>(result.structuredContent)
    const match = items.find((entry) => entry.tmdbId === 550)
    // Not in the library here, so Radarr omits the library id — the projection keeps it absent.
    expect(match).toMatchObject({
      tmdbId: 550,
      title: "Fight Club",
      year: 1999,
      status: "released",
    })
    expect(match).not.toHaveProperty("id")
  })

  it("add_movie then remove_movie round-trips a film through the library", async () => {
    // Fight Club (tmdb 550), distinct from the seeded film, so the add can't collide.
    const added = await callTool("add_movie", {
      tmdbId: 550,
      qualityProfileId: 1,
      rootFolderPath: MOVIE_ROOT_FOLDER,
    })
    expect(added.isError ?? false).toBe(false)
    const movie = added.structuredContent as { readonly id: number; readonly tmdbId: number }
    expect(movie).toMatchObject({ tmdbId: 550 })

    const removed = await callTool("remove_movie", { id: movie.id })
    expect(removed.isError ?? false).toBe(false)
    expect(removed.structuredContent).toEqual({ id: movie.id })
  })

  it("reports a typed tool error when adding an unknown tmdbId (isError over the wire)", async () => {
    const result = await callTool("add_movie", {
      tmdbId: 999_999_999,
      qualityProfileId: 1,
      rootFolderPath: MOVIE_ROOT_FOLDER,
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ _tag: "RadarrResponseError" })
  })
})
