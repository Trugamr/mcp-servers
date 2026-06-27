import { describe, expect, it } from "vitest"
import { SonarrResponseError } from "../../effect.js"
import { failureOf, runExit, successOf } from "./helpers.js"
import { SONARR_VERSION } from "./pinned.js"

// These run the SDK against a real Sonarr (booted by ./setup.ts) pinned to a fixed
// version, so they catch what mocks cannot: Sonarr's actual responses drifting
// from the SDK's schemas. The version is fixed, so a fresh instance is
// deterministic — assert exact values wherever it is, so drift fails loudly.
describe("Sonarr SDK against a live instance", () => {
  describe("reads decode against real responses", () => {
    it("reports the pinned app name and version", async () => {
      const status = successOf(await runExit((sonarr) => sonarr.system.getStatus))

      expect(status.appName).toBe("Sonarr")
      expect(status.version).toBe(SONARR_VERSION)
    })

    it("ships exactly the default quality profiles of a fresh install", async () => {
      const profiles = successOf(await runExit((sonarr) => sonarr.qualityProfile.list))

      expect(profiles.map((profile) => profile.name).toSorted()).toEqual([
        "Any",
        "HD - 720p/1080p",
        "HD-1080p",
        "HD-720p",
        "SD",
        "Ultra-HD",
      ])
    })

    it("has no root folders on a fresh instance", async () => {
      const folders = successOf(await runExit((sonarr) => sonarr.rootFolder.list))

      expect(folders).toHaveLength(0)
    })

    it("has no series on a fresh instance", async () => {
      const series = successOf(await runExit((sonarr) => sonarr.series.list))

      expect(series).toHaveLength(0)
    })

    it("decodes the health check list", async () => {
      // Health entries depend on environment (no root folder / indexer / download
      // client) and a network-dependent update check, so the count is not fixed —
      // the strict guarantee here is that the real payload decodes (successOf).
      const health = successOf(await runExit((sonarr) => sonarr.health.list))

      expect(Array.isArray(health)).toBe(true)
    })

    it("decodes disk space entries", async () => {
      // Disk entries mirror the runner's mounted filesystems, so neither the count
      // nor the values are fixed — again, decoding the real payload is the check.
      const disks = successOf(await runExit((sonarr) => sonarr.diskSpace.list))

      expect(Array.isArray(disks)).toBe(true)
    })
  })

  describe("writes round-trip through real endpoints", () => {
    it("creates a tag, sees it in the list, then deletes it", async () => {
      const created = successOf(await runExit((sonarr) => sonarr.tag.create("integration")))
      expect(created.label).toBe("integration")

      const afterCreate = successOf(await runExit((sonarr) => sonarr.tag.list))
      expect(afterCreate.some((tag) => tag.id === created.id)).toBe(true)

      successOf(await runExit((sonarr) => sonarr.tag.delete(created.id)))

      const afterDelete = successOf(await runExit((sonarr) => sonarr.tag.list))
      expect(afterDelete.some((tag) => tag.id === created.id)).toBe(false)
    })
  })

  describe("errors are typed", () => {
    it("maps a missing series to a SonarrResponseError carrying 404", async () => {
      const error = failureOf(await runExit((sonarr) => sonarr.series.get(999_999)))

      expect(error).toBeInstanceOf(SonarrResponseError)
      if (error instanceof SonarrResponseError) {
        expect(error.status).toBe(404)
      }
    })
  })
})
