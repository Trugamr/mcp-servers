import { McpSchema } from "@effect/ai"
import { callMcp } from "@trugamr/testkit/mcp"
import { ConfigProvider, Effect, Exit, Layer, Schema, Scope } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { httpServerLive } from "../server.js"

const host = "127.0.0.1"
const port = 38527
const endpoint = `http://${host}:${port}/mcp`

// Every tool the toolkit advertises. `tools/list` is served without touching
// Radarr, so this stays a unit assertion — the live suite covers calling them.
const TOOL_NAMES = [
  "get_system_status",
  "list_movies",
  "lookup_movie",
  "add_movie",
  "remove_movie",
  "search_releases",
  "grab_release",
  "list_queue",
  "list_quality_profiles",
  "get_quality_profile",
  "create_quality_profile",
  "update_quality_profile",
  "delete_quality_profile",
  "list_languages",
  "list_root_folders",
]

// Dummy Radarr config so the toolkit layer builds. These transport tests stop at
// the MCP handshake / tools listing, so no upstream Radarr request is made and the
// values are never dialed.
const TestConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["RADARR_BASE_URL", "http://radarr.test"],
      ["RADARR_API_KEY", "test-api-key"],
    ]),
  ),
)

const ServerUnderTest = httpServerLive({ host, port }).pipe(Layer.provide(TestConfig))

// Start the server once for the suite: building the layer binds the socket, and
// closing the scope tears it down.
let scope: Scope.CloseableScope
beforeAll(async () => {
  scope = Effect.runSync(Scope.make())
  await Effect.runPromise(Layer.buildWithScope(ServerUnderTest, scope))
})
afterAll(() => Effect.runPromise(Scope.close(scope, Exit.void)))

// Raw POST for asserting the wire shape directly; `callMcp` unwraps the JSON-RPC
// envelope, so it can't see whether the body is a bare object or a batch array.
const post = (body: unknown): Promise<Response> =>
  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  })

describe("radarr-mcp — Streamable HTTP transport", () => {
  it("completes the MCP initialize handshake over POST /mcp", async () => {
    const result = Schema.decodeUnknownSync(McpSchema.InitializeResult)(
      await callMcp(endpoint, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      }),
    )

    expect(result.serverInfo.name).toBe("radarr-mcp")
    expect(result.capabilities.tools).toBeDefined()
  })

  it("advertises the full toolkit via tools/list", async () => {
    const result = Schema.decodeUnknownSync(McpSchema.ListToolsResult)(
      await callMcp(endpoint, "tools/list", {}),
    )

    expect(result.tools.map((tool) => tool.name).toSorted()).toEqual(TOOL_NAMES.toSorted())
  })

  // The unwrap only collapses a one-element array — guard the boundary so it
  // can't grow into "strip any array wrapper." A bare object response (already
  // correct, e.g. once upstream is fixed) must pass through untouched.
  it("returns a bare JSON-RPC object, not an array, for a single request", async () => {
    const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    const message: unknown = await response.json()

    expect(Array.isArray(message)).toBe(false)
    expect(message).toMatchObject({ jsonrpc: "2.0", id: 1 })
  })
})
