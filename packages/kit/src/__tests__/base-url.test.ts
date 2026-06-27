import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { BaseUrl } from "../config.js"

const decode = Schema.decodeUnknownSync(BaseUrl)

describe("BaseUrl", () => {
  it("strips trailing slashes so joined paths can't double up", () => {
    expect(decode("http://radarr.test/")).toBe("http://radarr.test")
    expect(decode("http://radarr.test///")).toBe("http://radarr.test")
  })

  it("keeps an already-clean absolute URL untouched", () => {
    expect(decode("https://radarr.test:7878")).toBe("https://radarr.test:7878")
  })

  it("rejects a URL without an http(s) scheme", () => {
    expect(() => decode("radarr.test")).toThrow()
    expect(() => decode("ftp://radarr.test")).toThrow()
  })
})
