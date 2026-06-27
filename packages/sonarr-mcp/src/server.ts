import { McpServer } from "@effect/ai"
import { HttpRouter, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeSink, NodeStream } from "@effect/platform-node"
import { Layer, Logger } from "effect"
import { createServer } from "node:http"
import pkg from "../package.json" with { type: "json" }
import { SonarrLive } from "./config.js"
import { methodNotAllowedRoutes, streamableHttpMiddleware } from "./streamable-http.js"
import { SonarrToolkit, SonarrToolkitLive } from "./tools.js"

// `name` is the unscoped MCP server identity (distinct from the npm scope);
// `version` tracks package.json so a release bump can't leave it stale.
const name = "sonarr-mcp"
const version = pkg.version

/**
 * The transport-agnostic core: register the Sonarr toolkit, provide its handlers
 * and the Sonarr client. Each transport layer supplies the matching `McpServer`
 * implementation (`layerStdio` / `layerHttp`) on top of this.
 */
const ToolkitLive = McpServer.toolkit(SonarrToolkit).pipe(
  Layer.provide(SonarrToolkitLive),
  Layer.provide(SonarrLive),
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

/**
 * The Streamable HTTP MCP server: JSON-RPC over `POST /mcp`, bound to `host:port`.
 * Each request is its own stateless RPC session. stdout no longer carries the
 * protocol, so the default logger stays.
 *
 * `McpServer.layerHttp` runs MCP over `@effect/rpc`, whose JSON-RPC serializer
 * diverges from the 2025-06-18 spec; `streamableHttpMiddleware` conforms the
 * input/output and `methodNotAllowedRoutes` answers GET/DELETE with 405. See
 * `./streamable-http.ts` for the specifics.
 */
export const httpServerLive = (options: { readonly host: string; readonly port: number }) =>
  Layer.mergeAll(ToolkitLive, HttpRouter.Default.serve(streamableHttpMiddleware)).pipe(
    Layer.provide(McpServer.layerHttp({ name, version, path: "/mcp" })),
    Layer.provide(methodNotAllowedRoutes),
    // Logs "Listening on http://host:port" once the socket is actually bound.
    HttpServer.withLogAddress,
    Layer.provide(NodeHttpServer.layer(createServer, options)),
  )
