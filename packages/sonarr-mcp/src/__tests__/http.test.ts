import { McpSchema } from "@effect/ai"
import { ConfigProvider, Effect, Exit, Layer, Schema, Scope } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { httpServerLive } from "../server.js"

const host = "127.0.0.1"
const port = 38427
const endpoint = `http://${host}:${port}/mcp`

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

// POST one JSON-RPC request and return its single result payload, unwrapping the
// batch array the RPC server replies with. Callers decode it through the matching
// `McpSchema` schema, so a malformed response fails the test.
const resultOf = (method: string, params: unknown): Promise<unknown> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
      )
      const batch = (yield* Effect.promise(() => response.json())) as ReadonlyArray<{
        readonly result?: unknown
      }>
      const message = batch[0]
      if (message?.result === undefined) {
        throw new Error(`no result in JSON-RPC response: ${JSON.stringify(batch)}`)
      }
      return message.result
    }),
  )

describe("sonarr-mcp — Streamable HTTP transport", () => {
  it("completes the MCP initialize handshake over POST /mcp", async () => {
    const result = Schema.decodeUnknownSync(McpSchema.InitializeResult)(
      await resultOf("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      }),
    )

    expect(result.serverInfo.name).toBe("sonarr-mcp")
    expect(result.capabilities.tools).toBeDefined()
  })

  it("advertises get_system_status via tools/list", async () => {
    const result = Schema.decodeUnknownSync(McpSchema.ListToolsResult)(
      await resultOf("tools/list", {}),
    )

    expect(result.tools.map((tool) => tool.name)).toContain("get_system_status")
  })
})
