# @trugamr/sonarr-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes [Sonarr](https://sonarr.tv) to AI agents as tools, built on the `@trugamr/sonarr` Effect SDK. It speaks two transports from one binary:

- **stdio** (default) — the host spawns the server as a subprocess. This is how Claude Desktop / Claude Code run a local server.
- **Streamable HTTP** — a long-running service on `POST /mcp`, for self-hosting one server that clients connect to over the network.

## Configuration

The Sonarr connection is read from the environment (validated at startup — the server refuses to start if either is missing):

| Variable          | Required | Description                                                   |
| ----------------- | -------- | ------------------------------------------------------------- |
| `SONARR_BASE_URL` | yes      | Base URL of the Sonarr instance, e.g. `http://localhost:8989` |
| `SONARR_API_KEY`  | yes      | Sonarr API key (Settings → General)                           |

## Usage

The `sonarr-mcp` bin selects a transport by subcommand. A bare invocation is stdio, so existing host configs need no subcommand.

### stdio (default)

Register it with an MCP host. For Claude Desktop / Claude Code:

```jsonc
{
  "mcpServers": {
    "sonarr": {
      "command": "node",
      "args": ["/abs/path/to/packages/sonarr-mcp/dist/index.mjs"],
      "env": {
        "SONARR_BASE_URL": "http://localhost:8989",
        "SONARR_API_KEY": "your-api-key",
      },
    },
  },
}
```

### Streamable HTTP

```sh
SONARR_BASE_URL=http://localhost:8989 SONARR_API_KEY=your-api-key \
  sonarr-mcp http --port 3000
```

The endpoint is `POST /mcp`. Each request is its own stateless JSON-RPC session (no `Mcp-Session-Id`). Point an HTTP-capable MCP client at `http://<host>:3000/mcp`.

#### Self-hosting & security

There is **no application-level authentication** — the trust boundary is the network. Run it behind a VPN (Tailscale, WireGuard, …) or a firewall, never exposed to the public internet.

The server binds **`127.0.0.1` by default**, so it is unreachable off the host until you opt into a wider bind:

```sh
sonarr-mcp http --host 0.0.0.0 --port 3000   # reachable on the LAN/VPN interface
```

## CLI reference

| Command                           | Description                    |
| --------------------------------- | ------------------------------ |
| `sonarr-mcp` / `sonarr-mcp stdio` | Run over stdio (default)       |
| `sonarr-mcp http`                 | Run the Streamable HTTP server |

| Flag (`http` only) | Env fallback | Default     | Description  |
| ------------------ | ------------ | ----------- | ------------ |
| `--host`           | `HOST`       | `127.0.0.1` | Bind address |
| `--port`           | `PORT`       | `3000`      | Listen port  |

## Tools

| Tool                | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `get_system_status` | Sonarr instance status — version, runtime, OS, database, and authentication info. Read-only. |
