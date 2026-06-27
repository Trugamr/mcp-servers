#!/usr/bin/env node
import { Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import pkg from "../package.json" with { type: "json" }
import { httpServerLive, StdioServerLive } from "./server.js"

// HTTP network settings: flag → env → default. host defaults to loopback, so
// self-hosting opts into a wider bind (`--host 0.0.0.0`) behind its own
// VPN/firewall. Secrets stay in env (RADARR_BASE_URL / RADARR_API_KEY), read by
// the Radarr config layer.
const hostOption = Options.text("host").pipe(
  Options.withFallbackConfig(Config.string("HOST")),
  Options.withDefault("127.0.0.1"),
)
const portOption = Options.integer("port").pipe(
  Options.withFallbackConfig(Config.integer("PORT")),
  Options.withDefault(3000),
)

// Shared by the explicit `stdio` subcommand and the bare `radarr-mcp` default.
const runStdio = () => Layer.launch(StdioServerLive)

const stdio = Command.make("stdio", {}, runStdio)
const http = Command.make("http", { host: hostOption, port: portOption }, ({ host, port }) =>
  Layer.launch(httpServerLive({ host, port })),
)

// A bare invocation runs stdio — the shape local MCP hosts spawn.
const radarrMcp = Command.make("radarr-mcp", {}, runStdio).pipe(
  Command.withSubcommands([stdio, http]),
)

const cli = Command.run(radarrMcp, { name: "radarr-mcp", version: pkg.version })

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
