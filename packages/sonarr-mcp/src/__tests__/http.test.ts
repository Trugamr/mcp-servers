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

// Raw POST for asserting the wire shape directly; `callMcp` unwraps the JSON-RPC
// envelope, so it can't see whether the body is a bare object or a batch array.
const post = (body: unknown): Promise<Response> => postRaw(JSON.stringify(body))

// Send a body verbatim — lets a malformed JSON payload reach the server so the
// parse-error path can be exercised.
const postRaw = (body: string): Promise<Response> =>
  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body,
  })

// Node's fetch types `Response.json()` as `unknown`; this reader hands the parsed
// body back as `any` so field assertions stay annotation-only (no `as`).
const readJson = (response: Response): Promise<any> => response.json()

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

  // The unwrap only collapses a one-element array — guard the boundary so it
  // can't grow into "strip any array wrapper." A bare object response (already
  // correct, e.g. once upstream is fixed) must pass through untouched.
  it("returns a bare JSON-RPC object, not an array, for a single request", async () => {
    const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    const message: unknown = await response.json()

    expect(Array.isArray(message)).toBe(false)
    expect(message).toMatchObject({ jsonrpc: "2.0", id: 1 })
  })

  // `@effect/rpc` coerces the id through `BigInt`, which throws on a non-numeric
  // string; the middleware swaps a placeholder in and restores the original, so a
  // string id round-trips verbatim per JSON-RPC 2.0.
  it("echoes a string request id verbatim", async () => {
    const response = await post({ jsonrpc: "2.0", id: "abc-1", method: "tools/list", params: {} })
    const message = await readJson(response)

    expect(message.id).toBe("abc-1")
    expect(message.result).toBeDefined()
  })

  // A numeric-looking string id must stay a string, not be coerced to a number.
  it("preserves the JSON type of a numeric-string id", async () => {
    const response = await post({ jsonrpc: "2.0", id: "42", method: "tools/list", params: {} })
    const message = await readJson(response)

    expect(message.id).toBe("42")
  })

  // A well-formed request for a method the server doesn't implement is a valid
  // request, so it's answered with one JSON object carrying -32601 — at HTTP 200.
  it("answers an unknown method with -32601 and echoes the id", async () => {
    const response = await post({ jsonrpc: "2.0", id: 7, method: "foo/bar", params: {} })
    const message = await readJson(response)

    expect(response.status).toBe(200)
    expect(message.id).toBe(7)
    expect(message.error.code).toBe(-32601)
    // No Effect framework internals leak into the error object.
    expect("_tag" in message.error).toBe(false)
  })

  it("answers malformed JSON with -32700 and a null id at HTTP 400", async () => {
    const response = await postRaw("{ not valid json")
    const message = await readJson(response)

    expect(response.status).toBe(400)
    expect(message.id).toBe(null)
    expect(message.error.code).toBe(-32700)
  })

  it("answers a request missing the jsonrpc field with -32600 at HTTP 400", async () => {
    const response = await post({ id: 1, method: "tools/list" })
    const message = await readJson(response)

    expect(response.status).toBe(400)
    expect(message.error.code).toBe(-32600)
  })

  // Batching was removed in 2025-06-18; reject it explicitly rather than answering
  // with a silent empty body.
  it("rejects a JSON-RPC batch array with -32600 at HTTP 400", async () => {
    const response = await post([{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }])
    const message = await readJson(response)

    expect(response.status).toBe(400)
    expect(message.error.code).toBe(-32600)
  })

  // A notification carries no id and expects no response: 202 Accepted, empty body.
  it("answers a notification with 202 and an empty body", async () => {
    const response = await post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })

    expect(response.status).toBe(202)
    expect(await response.text()).toBe("")
  })

  it("answers GET and DELETE on /mcp with 405 and an Allow header", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(endpoint, { method })
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toContain("POST")
    }
  })

  // The id-swap (placeholder in, original out) must survive a real round-trip
  // through `@effect/rpc` and the toolkit, not just the short-circuit paths.
  it("restores the original id on a forwarded tool call", async () => {
    const response = await post({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "get_series", arguments: {} },
    })
    const message = await readJson(response)

    expect(message.id).toBe(9)
    // A protocol-level error (if any) carries no framework internals; a tool-level
    // failure rides `result.isError`/`structuredContent`, which the sanitizer
    // leaves alone by design.
    if (message.error) {
      expect("_tag" in message.error).toBe(false)
      expect("data" in message.error).toBe(false)
    }
  })
})
