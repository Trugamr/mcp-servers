import { McpSchema } from "@effect/ai"
import { callMcp } from "@trugamr/testkit/mcp"
import {
  injectSonarr,
  seedSeries,
  type SeededSeries,
  SONARR_VERSION,
} from "@trugamr/testkit/sonarr"
import { ConfigProvider, Effect, Exit, Layer, Schema, Scope } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { httpServerLive } from "../../server.js"

const host = "127.0.0.1"
const port = 38428
const endpoint = `http://${host}:${port}/mcp`

// Boot the real MCP HTTP server once, pointed at the Sonarr the global setup
// resolved. Building the layer binds the socket; closing the scope tears it down.
let scope: Scope.CloseableScope
beforeAll(async () => {
  const { baseUrl, apiKey } = injectSonarr()
  const config = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["SONARR_BASE_URL", baseUrl],
        ["SONARR_API_KEY", apiKey],
      ]),
    ),
  )
  const server = httpServerLive({ host, port }).pipe(Layer.provide(config))
  scope = Effect.runSync(Scope.make())
  await Effect.runPromise(Layer.buildWithScope(server, scope))
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
describe("sonarr-mcp tools over Streamable HTTP, against a live Sonarr", () => {
  it("get_system_status round-trips a decoded status (a no-arg GET)", async () => {
    const result = await callTool("get_system_status", {})

    expect(result.isError ?? false).toBe(false)
    expect(result.structuredContent).toMatchObject({ appName: "Sonarr", version: SONARR_VERSION })
  })

  it("list_quality_profiles returns the default profiles (a list GET)", async () => {
    const result = await callTool("list_quality_profiles", {})

    expect(result.isError ?? false).toBe(false)
    const items = itemsOf(result.structuredContent)
    expect(items.length).toBeGreaterThan(0)
  })

  it("creates, lists, then deletes a tag (a write round-trip)", async () => {
    const created = await callTool("create_tag", { label: "integration" })
    expect(created.isError ?? false).toBe(false)
    const tag = created.structuredContent as { readonly id: number; readonly label: string }
    expect(tag).toMatchObject({ label: "integration" })

    const listed = await callTool("list_tags", {})
    const items = itemsOf<{ readonly id: number }>(listed.structuredContent)
    expect(items.some((entry) => entry.id === tag.id)).toBe(true)

    const deleted = await callTool("delete_tag", { tagId: tag.id })
    expect(deleted.isError ?? false).toBe(false)
    expect(deleted.structuredContent).toMatchObject({ id: tag.id })
  })

  it("reports a typed tool error for an unknown series id (isError over the wire)", async () => {
    const result = await callTool("get_series", { seriesId: 999_999 })

    expect(result.isError).toBe(true)
    // Failures encode the typed ToolError ({ _tag, message }) under structuredContent,
    // the same channel successes use — so assert on the tag, not a substring of the result.
    expect(result.structuredContent).toMatchObject({ _tag: "SonarrResponseError" })
  })

  // The query surface (filter/sort/cursor) is the one tool with real logic on top
  // of the SDK call, so prove it filters against real data — seed one known series
  // and check a couple of filters narrow to it (and exclude it when they shouldn't).
  describe("list_series filtering against a seeded series", () => {
    let seeded: SeededSeries
    beforeAll(async () => {
      seeded = await seedSeries()
    })

    it("narrows to the seeded series by title and year (a couple of filters)", async () => {
      const result = await callTool("list_series", {
        filter: { title: { contains: "Unfortunate" }, year: { eq: 2017 } },
      })

      expect(result.isError ?? false).toBe(false)
      const items = itemsOf<{ readonly id: number; readonly title: string }>(
        result.structuredContent,
      )
      expect(items).toHaveLength(1)
      expect(items[0]?.id).toBe(seeded.id)
      expect(items[0]?.title).toContain("Unfortunate")
    })

    it("excludes the series when a filter rules it out (proves it filters, not echoes)", async () => {
      const result = await callTool("list_series", { filter: { year: { gte: 2030 } } })

      expect(result.isError ?? false).toBe(false)
      const items = itemsOf(result.structuredContent)
      expect(items).toHaveLength(0)
    })
  })
})
