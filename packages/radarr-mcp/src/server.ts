import { McpServer } from "@effect/ai"
import { HttpApp, HttpBody, HttpRouter, HttpServer, HttpServerResponse } from "@effect/platform"
import { NodeHttpServer, NodeSink, NodeStream } from "@effect/platform-node"
import { Effect, Layer, Logger } from "effect"
import { createServer } from "node:http"
import pkg from "../package.json" with { type: "json" }
import { RadarrLive } from "./config.js"
import { RadarrToolkit, RadarrToolkitLive } from "./tools.js"

// `name` is the unscoped MCP server identity (distinct from the npm scope);
// `version` tracks package.json so a release bump can't leave it stale.
const name = "radarr-mcp"
const version = pkg.version

/**
 * The transport-agnostic core: register the Radarr toolkit, provide its handlers
 * and the Radarr client. Each transport layer supplies the matching `McpServer`
 * implementation (`layerStdio` / `layerHttp`) on top of this.
 */
const ToolkitLive = McpServer.toolkit(RadarrToolkit).pipe(
  Layer.provide(RadarrToolkitLive),
  Layer.provide(RadarrLive),
)

/**
 * The stdio MCP server: JSON-RPC over stdin/stdout, with all logs routed to
 * stderr. The stderr logger is critical — stdout carries the JSON-RPC stream, so
 * any log written there would corrupt the protocol. We *replace* the default
 * (stdout) logger rather than adding to it, so nothing leaks onto stdout.
 */
export const StdioServerLive = ToolkitLive.pipe(
  Layer.provide(
    McpServer.layerStdio({ name, version, stdin: NodeStream.stdin, stdout: NodeSink.stdout }),
  ),
  Layer.provide(Logger.replace(Logger.defaultLogger, Logger.prettyLogger({ stderr: true }))),
)

// Shared across responses; `TextDecoder` is stateless for one-shot decode calls.
const textDecoder = new TextDecoder()

/**
 * `McpServer.layerHttp` runs MCP over `@effect/rpc`'s generic JSON-RPC protocol,
 * which frames every `application/json` POST response as a JSON-RPC *batch* — a
 * one-element array `[{ ... }]` even when the client sent a single request. MCP's
 * Streamable HTTP transport removed JSON-RPC batching in 2025-06-18 and requires
 * a single request to be answered with one JSON object:
 *
 *   "If the input is a JSON-RPC request, the server MUST either return
 *    Content-Type: text/event-stream ... or Content-Type: application/json, to
 *    return one JSON object."
 *
 * Spec:     https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#sending-messages-to-the-server
 * Batching: https://modelcontextprotocol.io/specification/2025-06-18/changelog#major-changes ("Remove support for JSON-RPC batching")
 *
 * Strict clients decode the body as a single object and reject the array
 * outright. This unwraps a one-element response array back to the bare object;
 * multi-message responses (length > 1) pass through unchanged. Drop once the
 * upstream fix ships (Effect-TS/effect#6274, PR #6275).
 *
 * Implemented as a pre-response handler rather than an `Effect.map` middleware:
 * the latter runs *after* the response is already written to the socket, so its
 * result is discarded — a pre-response handler transforms the response first.
 */
const unwrapSingleJsonRpcResponse = <E, R>(app: HttpApp.Default<E, R>): HttpApp.Default<E, R> =>
  HttpApp.withPreResponseHandler(app, (_request, response) => {
    const body = response.body
    if (body._tag !== "Uint8Array" || !body.contentType.startsWith("application/json")) {
      return Effect.succeed(response)
    }
    let payload: unknown
    try {
      payload = JSON.parse(textDecoder.decode(body.body))
    } catch {
      return Effect.succeed(response)
    }
    if (!Array.isArray(payload) || payload.length !== 1) {
      return Effect.succeed(response)
    }
    return Effect.succeed(
      HttpServerResponse.setBody(
        response,
        HttpBody.text(JSON.stringify(payload[0]), body.contentType),
      ),
    )
  })

/**
 * The Streamable HTTP MCP server: JSON-RPC over `POST /mcp`, bound to
 * `host:port`. Each request is its own stateless RPC session. stdout no longer
 * carries the protocol, so the default logger stays.
 */
export const httpServerLive = (options: { readonly host: string; readonly port: number }) =>
  Layer.mergeAll(ToolkitLive, HttpRouter.Default.serve(unwrapSingleJsonRpcResponse)).pipe(
    Layer.provide(McpServer.layerHttp({ name, version, path: "/mcp" })),
    // Logs "Listening on http://host:port" once the socket is actually bound.
    HttpServer.withLogAddress,
    Layer.provide(NodeHttpServer.layer(createServer, options)),
  )
