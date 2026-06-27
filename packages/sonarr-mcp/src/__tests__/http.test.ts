import { McpSchema } from "@effect/ai"
import { callMcp } from "@trugamr/testkit/mcp"
import { ConfigProvider, Effect, Exit, Layer, Schema, Scope } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { httpServerLive } from "../server.js"

const host = "127.0.0.1"
const port = 38427
const endpoint = `http://${host}:${port}/mcp`

// Every tool the toolkit advertises. `tools/list` is served without touching
// Sonarr, so this stays a unit assertion — the live suite covers calling them.
const TOOL_NAMES = [
  "get_system_status",
  "list_series",
  "get_series",
  "list_episodes",
  "list_quality_profiles",
  "list_root_folders",
  "add_root_folder",
  "delete_root_folder",
  "list_tags",
  "create_tag",
  "delete_tag",
  "list_health",
  "list_disk_space",
]

// Dummy Sonarr config so the toolkit layer builds. These transport tests stop at
// the MCP handshake / tools listing, so no upstream Sonarr request is made and
// the values are never dialed.
const TestConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["SONARR_BASE_URL", "http://sonarr.test"],
      ["SONARR_API_KEY", "test-api-key"],
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

describe("sonarr-mcp — Streamable HTTP transport", () => {
  it("completes the MCP initialize handshake over POST /mcp", async () => {
    const result = Schema.decodeUnknownSync(McpSchema.InitializeResult)(
      await callMcp(endpoint, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      }),
    )

    expect(result.serverInfo.name).toBe("sonarr-mcp")
    expect(result.capabilities.tools).toBeDefined()
  })

  it("advertises the full toolkit via tools/list", async () => {
    const result = Schema.decodeUnknownSync(McpSchema.ListToolsResult)(
      await callMcp(endpoint, "tools/list", {}),
    )

    expect(result.tools.map((tool) => tool.name).toSorted()).toEqual(TOOL_NAMES.toSorted())
  })
})
