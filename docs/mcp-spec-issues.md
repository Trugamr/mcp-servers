# MCP spec conformance

Tracks where `@trugamr/sonarr-mcp` stands against the [MCP 2025-06-18 spec](https://modelcontextprotocol.io/specification/2025-06-18) — base protocol, lifecycle, and Streamable HTTP transport — and JSON-RPC 2.0, which MCP requires ("All messages between MCP clients and servers MUST follow the JSON-RPC 2.0 specification").

Most JSON-RPC defects originate in `@effect/rpc@0.75.1`'s serializer (`RpcSerialization`/`RpcMessage`), reached through `@effect/ai`'s `McpServer`. They affect both transports. The HTTP transport is conformed in front of `@effect/rpc` by [`packages/sonarr-mcp/src/streamable-http.ts`](../packages/sonarr-mcp/src/streamable-http.ts) (`streamableHttpMiddleware` + `methodNotAllowedRoutes`); stdio is not yet addressed.

## Fixed — HTTP transport

Each row cites the rule it satisfies; the HTTP behavior is covered by `packages/sonarr-mcp/src/__tests__/http.test.ts`.

- **Response echoes the request id.** Base protocol: "Responses MUST include the same ID as the request they correspond to." `@effect/rpc` replaced the id with `-32603` on defects; the middleware restores the original id verbatim.
- **String / numeric-string ids.** Base protocol allows a string id. `@effect/rpc` coerced ids through `Number`/`BigInt` (a non-numeric string threw "Cannot convert … to a BigInt"); the middleware swaps a placeholder integer in before `@effect/rpc` and restores the caller's id, preserving its JSON type.
- **Null request id rejected.** Base protocol: "Unlike base JSON-RPC, the ID MUST NOT be `null`." A request with `id: null` is answered with `-32600`.
- **Standard error codes.** Parse error → `-32700`, invalid request / batch → `-32600`, unknown method → `-32601`, internal → `-32603`. `@effect/rpc` emitted a non-standard `{ _tag: "Defect", code: 1 }` / `{ _tag: "Cause", code: 0 }`.
- **No framework internals in errors.** Base protocol error object is exactly `{ code: integer, message, data? }`. The middleware rewrites errors to a bare `{ code, message }`, dropping `_tag` and the raw `data` (which leaked `~@effect/ai/AiError`, `ParseError` traces, full causes).
- **Notifications → 202.** Transport: "If the input is a JSON-RPC response or notification … the server MUST return HTTP status code 202 Accepted with no body." Was 200.
- **GET/DELETE → 405.** Transport: the server MUST return `text/event-stream` or `405 Method Not Allowed` on GET, and MAY return 405 on DELETE when sessions aren't offered. Both return 405 with `Allow: POST`. Was 404.
- **Batch rejected explicitly.** Batching was removed in 2025-06-18; a batch array is answered with `-32600` rather than a silent empty body.
- **`MCP-Protocol-Version` header.** Transport: "If the server receives a request with an invalid or unsupported `MCP-Protocol-Version`, it MUST respond with `400 Bad Request`." Validated against the versions `@effect/ai` speaks; a missing header is allowed (the spec says assume the default).

Error HTTP status follows the transport spec: a well-formed request is answered with one JSON object at 200 (an unknown method's `-32601` included); input the server cannot accept (malformed / invalid / batch) returns 400.

## Deferred

- **stdio transport.** `StdioServerLive` shares the same `@effect/rpc` serializer, so it still clobbers the defect id, leaks internals, and throws on a string id. Options: a `pnpm patch` of `@effect/rpc` (`RpcSerialization` + `RpcMessage`) — fixes both transports at the source but must be re-reviewed on every bump; or a corrected `RpcSerialization` layer provided to both transports. Lower priority — stdio clients are local and trusted.
- **Pin the deployed image.** Deploy from a pinned digest rather than a moving `:edge` tag so the server doesn't change underneath a client. (Locate the deploy reference; it may live outside this repo.)
- **`initialize`-body `protocolVersion` field.** Distinct from the transport header above; negotiation is owned by `@effect/ai`'s `McpServer` (responds with a supported version per the lifecycle spec, or `-32602` per its error example). Not overridden here.

## Won't fix

- **Root-folder tools.** Intentionally SDK-only, not advertised in `tools/list` — see [`docs/sonarr-api-coverage.md`](./sonarr-api-coverage.md). Not a bug.
- **Permissive `Accept` / `Content-Type`.** The spec puts the `Accept` MUST on the client, not the server; accepting lenient headers aids client compatibility.

## Upstream

The batch-array issue was reported as [Effect-TS/effect#6274](https://github.com/Effect-TS/effect/issues/6274) (closed COMPLETED) with fix PR [#6275](https://github.com/Effect-TS/effect/pull/6275) (closed **without** merging). `@effect/rpc@0.75.1` — pinned here and the latest published release — still contains every bug, so a dependency bump is not a fix today. Revisit dropping the middleware once a release lands the serializer fix.
