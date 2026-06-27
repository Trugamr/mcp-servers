import {
  HttpApp,
  HttpBody,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { Effect, Stream } from "effect"

/**
 * Adapt `@effect/rpc`'s generic JSON-RPC HTTP transport to MCP's Streamable HTTP
 * rules (2025-06-18). `@effect/ai`'s `McpServer.layerHttp` runs MCP over
 * `@effect/rpc`, whose serializer diverges from the spec in several ways: it
 * frames every response as a one-element batch array, replaces the request id
 * with the internal error code on defects, coerces ids through `Number`/`BigInt`
 * (crashing on a string id), and leaks Effect internals (`_tag`, the raw cause) in
 * error bodies. It also answers notifications with 200 and offers no GET/DELETE
 * handling.
 *
 * This middleware sits in front of that transport and:
 *  - validates the JSON-RPC envelope itself, answering the parse / invalid / batch /
 *    unknown-method / notification cases directly with spec-correct status codes;
 *  - swaps a placeholder integer id in before the request reaches `@effect/rpc` (so
 *    a string id never hits the crashing `BigInt` coercion), then restores the
 *    original id verbatim on the way out (which also repairs the defect-id clobber);
 *  - rewrites error objects to the bare `{ code, message }` the spec defines,
 *    dropping `_tag` and the raw `data`; and
 *  - unwraps the one-element batch array to a bare object.
 *
 * Drop the parts that overlap `@effect/rpc` once it conforms upstream
 * (Effect-TS/effect#6274, PR #6275 — closed unmerged; 0.75.1 is latest and unfixed).
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

// Requests the toolkit server answers; any other method is Method not found (-32601).
const SUPPORTED_METHODS = new Set([
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
  "completion/complete",
])

// MCP protocol versions `@effect/ai`'s McpServer can speak. A present
// `MCP-Protocol-Version` header outside this set is a 400 per the transport spec.
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
  "2024-10-07",
])

// Every POST carries exactly one request (batching is rejected), so a single fixed
// id stands in while `@effect/rpc` processes it; the real id is restored on output.
const PLACEHOLDER_ID = 1

// Stateless one-shot decode/encode; `TextDecoder`/`TextEncoder` hold no state here.
const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

type JsonRpcId = string | number | null

// JSON-RPC 2.0 reserves -32768..-32000 for protocol errors. A code outside that
// range (e.g. `@effect/rpc`'s `1` for a defect, or `0` for an unmapped failure) is
// not a usable wire code, so it collapses to Internal error.
const isReservedErrorCode = (code: unknown): code is number =>
  typeof code === "number" && Number.isInteger(code) && code >= -32768 && code <= -32000

// MCP tightens JSON-RPC: a request id must be a string or integer, never null.
const isValidId = (value: unknown): value is string | number =>
  typeof value === "string" || (typeof value === "number" && Number.isInteger(value))

const errorResponse = (id: JsonRpcId, code: number, message: string, status: number) =>
  HttpServerResponse.text(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    contentType: "application/json",
  })

type Classified =
  | { readonly kind: "parse-error" }
  | { readonly kind: "batch" }
  | { readonly kind: "invalid"; readonly id: JsonRpcId }
  | { readonly kind: "notification" }
  | { readonly kind: "unknown-method"; readonly id: JsonRpcId }
  | {
      readonly kind: "valid"
      readonly id: string | number
      readonly message: Record<string, unknown>
    }

/** Sort a POST body into the JSON-RPC cases the transport handles distinctly. */
const classify = (text: string): Classified => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: "parse-error" }
  }
  if (Array.isArray(parsed)) {
    return { kind: "batch" }
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "invalid", id: null }
  }

  const message = parsed as Record<string, unknown>
  const id = isValidId(message["id"]) ? message["id"] : null

  // A well-formed JSON-RPC message needs jsonrpc:"2.0" and a string method.
  if (message["jsonrpc"] !== "2.0" || typeof message["method"] !== "string") {
    return { kind: "invalid", id }
  }
  // No id member at all is a notification; a present-but-non-string/integer id
  // (including null) is an invalid request under MCP's tightened id rule.
  if (!("id" in message)) {
    return { kind: "notification" }
  }
  if (!isValidId(message["id"])) {
    return { kind: "invalid", id: null }
  }
  if (!SUPPORTED_METHODS.has(message["method"])) {
    return { kind: "unknown-method", id: message["id"] }
  }
  return { kind: "valid", id: message["id"], message }
}

/**
 * Proxy the request so `@effect/rpc` reads a body whose id is the placeholder
 * integer, without consuming the original (already-drained) source stream. Only
 * the four body accessors are overridden; everything else — `headers`, `method`,
 * the handled marker `@effect/platform` sets — binds to the real request.
 */
const withReplacedBody = (
  request: HttpServerRequest.HttpServerRequest,
  body: string,
): HttpServerRequest.HttpServerRequest => {
  const bytes = textEncoder.encode(body)
  return new Proxy(request, {
    get(target, property) {
      switch (property) {
        case "text":
          return Effect.succeed(body)
        case "json":
          return Effect.succeed(JSON.parse(body))
        case "arrayBuffer":
          return Effect.succeed(bytes.buffer)
        case "stream":
          return Stream.succeed(bytes)
        default:
          return Reflect.get(target, property, target)
      }
    },
  })
}

/**
 * Reduce an upstream error object to the bare `{ code, message }` the spec allows,
 * dropping `_tag`, `data`, and any unusable code. Exported so a unit test can drive
 * it directly with `@effect/rpc`'s `Defect`/`Cause` shapes.
 */
export const sanitizeError = (error: Record<string, unknown>) => {
  const code = isReservedErrorCode(error["code"]) ? error["code"] : -32603
  const message =
    code === -32603 || typeof error["message"] !== "string" || error["message"].length === 0
      ? "Internal error"
      : error["message"]
  return { code, message }
}

/**
 * On the way out: restore the caller's id, sanitize any error, and unwrap the
 * one-element batch array `@effect/rpc` frames a single response as. A genuine
 * multi-message array (length > 1) and a non-JSON body pass through untouched.
 */
const restoreResponse = (
  response: HttpServerResponse.HttpServerResponse,
  id: JsonRpcId,
): HttpServerResponse.HttpServerResponse => {
  const body = response.body
  if (body._tag !== "Uint8Array" || !body.contentType.startsWith("application/json")) {
    return response
  }
  let payload: unknown
  try {
    payload = JSON.parse(textDecoder.decode(body.body))
  } catch {
    return response
  }
  const message = Array.isArray(payload) ? (payload.length === 1 ? payload[0] : undefined) : payload
  if (message === undefined || message === null || typeof message !== "object") {
    return response
  }
  const record = message as Record<string, unknown>
  record["id"] = id
  if (typeof record["error"] === "object" && record["error"] !== null) {
    record["error"] = sanitizeError(record["error"] as Record<string, unknown>)
  }
  return HttpServerResponse.setBody(
    response,
    HttpBody.text(JSON.stringify(record), body.contentType),
  )
}

/**
 * The MCP Streamable HTTP front: wrap the `@effect/rpc` MCP app so its JSON-RPC
 * input and output conform to the 2025-06-18 spec. Pass to `HttpRouter.Default.serve`.
 */
export const streamableHttpMiddleware = <E, R>(app: HttpApp.Default<E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    // GET/DELETE are answered by the router routes below; only POST carries messages.
    if (request.method !== "POST") {
      return yield* app
    }

    const protocolVersion: string | undefined = request.headers["mcp-protocol-version"]
    if (protocolVersion !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
      return errorResponse(
        null,
        -32600,
        `Unsupported MCP-Protocol-Version: ${protocolVersion}`,
        400,
      )
    }

    // Reading the body here drains and caches the request's source; the inner app
    // then reads the swapped body off the proxy in the `valid` branch.
    const text = yield* Effect.orElseSucceed(request.text, () => "")
    const classified = classify(text)

    switch (classified.kind) {
      case "parse-error":
        return errorResponse(null, -32700, "Parse error", 400)
      case "batch":
        return errorResponse(null, -32600, "JSON-RPC batching is not supported", 400)
      case "invalid":
        return errorResponse(classified.id, -32600, "Invalid Request", 400)
      case "notification":
        // Accepted, no body — a JSON-RPC notification expects no response.
        return HttpServerResponse.empty({ status: 202 })
      case "unknown-method":
        // A well-formed request is answered with one JSON object, error and all.
        return errorResponse(classified.id, -32601, "Method not found", 200)
      case "valid": {
        const swapped = JSON.stringify({ ...classified.message, id: PLACEHOLDER_ID })
        const replacement = withReplacedBody(request, swapped)
        return yield* HttpApp.withPreResponseHandler(
          Effect.provideService(app, HttpServerRequest.HttpServerRequest, replacement),
          (_request, response) => Effect.succeed(restoreResponse(response, classified.id)),
        )
      }
    }
  })

const methodNotAllowed = HttpServerResponse.empty({ status: 405 }).pipe(
  HttpServerResponse.setHeader("Allow", "POST"),
)

/**
 * Answer GET/DELETE on the MCP endpoint with 405 + `Allow: POST`. The transport
 * spec wants 405 (not 404) when the server offers neither an SSE stream on GET nor
 * session teardown on DELETE. `HttpRouter.Default` is memoized, so these land on
 * the same router as the MCP POST route from `McpServer.layerHttp`.
 */
export const methodNotAllowedRoutes = HttpRouter.Default.use((router) =>
  Effect.all(
    [
      router.get("/mcp", Effect.succeed(methodNotAllowed)),
      router.del("/mcp", Effect.succeed(methodNotAllowed)),
    ],
    { discard: true },
  ),
)
