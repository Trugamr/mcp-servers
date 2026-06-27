import { describe, expect, it } from "vitest"
import { sanitizeError } from "../streamable-http.js"

// `@effect/rpc`'s serializer hands errors out in two shapes — a `Defect` (a hard
// failure) and a `Cause` (a typed failure) — both carrying a `_tag`, an unusable
// code, and a raw `data` payload that leaks Effect internals. `sanitizeError`
// must reduce each to the bare `{ code, message }` the MCP/JSON-RPC spec allows.
describe("sanitizeError", () => {
  it("collapses a Defect to -32603 and drops _tag/data", () => {
    const clean = sanitizeError({
      _tag: "Defect",
      code: 1,
      message: "A defect occurred",
      data: { secret: "leak" },
    })

    expect(clean).toEqual({ code: -32603, message: "Internal error" })
  })

  it("collapses a Cause with an unmapped code to -32603 and drops the raw cause", () => {
    const clean = sanitizeError({
      _tag: "Cause",
      code: 0,
      message: '{"_id":"Cause","_tag":"Fail"}',
      data: { "~@effect/ai/AiError": "~@effect/ai/AiError" },
    })

    expect(clean).toEqual({ code: -32603, message: "Internal error" })
  })

  it("keeps a reserved JSON-RPC code and its message", () => {
    const clean = sanitizeError({ _tag: "Cause", code: -32602, message: "Invalid params" })

    expect(clean).toEqual({ code: -32602, message: "Invalid params" })
  })
})
