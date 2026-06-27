/**
 * POST one JSON-RPC request to an MCP Streamable HTTP endpoint and return its
 * single `result` payload, unwrapping the batch array the RPC server replies with.
 * A tool-level failure still arrives as a `result` (with `isError: true`); only a
 * missing result — a protocol-level error — throws here. Callers decode the result
 * through the matching `McpSchema` schema, so a malformed payload fails the test.
 */
export const callMcp = async (
  endpoint: string,
  method: string,
  params: unknown,
): Promise<unknown> => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const batch = (await response.json()) as ReadonlyArray<{ readonly result?: unknown }>
  const message = batch[0]
  if (message?.result === undefined) {
    throw new Error(`no result in JSON-RPC response: ${JSON.stringify(batch)}`)
  }
  return message.result
}
