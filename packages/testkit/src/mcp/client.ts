/**
 * POST one JSON-RPC request to an MCP Streamable HTTP endpoint and return its
 * `result` payload. A spec-compliant server (MCP 2025-06-18) answers a single
 * request with one JSON-RPC object; a one-element batch array is also unwrapped,
 * for resilience against servers that still frame responses that way. A tool-level
 * failure still arrives as a `result` (with `isError: true`); only a missing
 * result — a protocol-level error — throws here. Callers decode the result through
 * the matching `McpSchema` schema, so a malformed payload fails the test.
 */
export const callMcp = async (
  endpoint: string,
  method: string,
  parameters: unknown,
): Promise<unknown> => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: parameters }),
  })
  const payload = await response.json()
  const message: { readonly result?: unknown } = Array.isArray(payload) ? payload[0] : payload
  if (message?.result === undefined) {
    throw new Error(`no result in JSON-RPC response: ${JSON.stringify(payload)}`)
  }
  return message.result
}
