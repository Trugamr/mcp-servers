import { McpServer } from "@effect/ai"
import { NodeSink, NodeStream } from "@effect/platform-node"
import { Layer, Logger } from "effect"
import { SonarrLive } from "./config.js"
import { SonarrToolkit, SonarrToolkitLive } from "./tools.js"

/**
 * The full stdio MCP server: register the Sonarr toolkit, run it over
 * stdin/stdout, and route all logs to stderr.
 *
 * The stderr logger is critical — stdout carries the JSON-RPC stream, so any
 * log written there would corrupt the protocol. We *replace* the default
 * (stdout) logger rather than adding to it, so nothing leaks onto stdout.
 */
export const ServerLive = McpServer.toolkit(SonarrToolkit).pipe(
  Layer.provide(SonarrToolkitLive),
  Layer.provide(SonarrLive),
  Layer.provide(
    McpServer.layerStdio({
      name: "sonarr-mcp",
      version: "0.0.0",
      stdin: NodeStream.stdin,
      stdout: NodeSink.stdout,
    }),
  ),
  Layer.provide(Logger.replace(Logger.defaultLogger, Logger.prettyLogger({ stderr: true }))),
)
