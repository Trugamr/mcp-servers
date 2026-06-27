import { seedSeries, type SeededSeries, SPARE_ROOT_FOLDER } from "@trugamr/testkit/sonarr"
import { beforeAll, describe, expect, it } from "vitest"
import { runExit, successOf } from "./helpers.js"

// Drives the SDK against a real Sonarr (booted by ./setup.ts), decoding actual
// Sonarr payloads through the SDK's schemas so schema drift fails loudly. Trimmed
// to the surfaces the MCP integration suite doesn't reach: health and disk-space
// (the MCP suite exercises no list_health/list_disk_space tool), the root-folder
// write round-trip (no MCP tool at all), and the rich seeded series/episode reads.
// The system-status and quality-profile reads, the tag round-trip, and the typed
// 404 are covered indirectly there — those MCP handlers call straight through these
// same SDK operations.
describe("Sonarr SDK against a pinned Sonarr instance", () => {
  describe("health.list", () => {
    it("decodes the health checks", async () => {
      // The entries (missing root folder / indexer / download client, plus a
      // network-dependent update check) vary, so decoding the real payload is the
      // assertion here, not the count.
      const health = successOf(await runExit((sonarr) => sonarr.health.list))

      expect(Array.isArray(health)).toBe(true)
    })
  })

  describe("diskSpace.list", () => {
    it("decodes the mounted filesystems", async () => {
      // Entries mirror the runner's mounts, so the values aren't fixed — but a
      // container always has at least its root filesystem.
      const disks = successOf(await runExit((sonarr) => sonarr.diskSpace.list))

      expect(disks.length).toBeGreaterThan(0)
    })
  })

  describe("rootFolder write round-trip", () => {
    it("adds, lists, then deletes a root folder", async () => {
      const added = successOf(await runExit((sonarr) => sonarr.rootFolder.add(SPARE_ROOT_FOLDER)))
      expect(added).toMatchObject({ path: SPARE_ROOT_FOLDER, accessible: true })

      const afterAdd = successOf(await runExit((sonarr) => sonarr.rootFolder.list))
      expect(afterAdd.some((folder) => folder.id === added.id)).toBe(true)

      successOf(await runExit((sonarr) => sonarr.rootFolder.delete(added.id)))

      const afterDelete = successOf(await runExit((sonarr) => sonarr.rootFolder.list))
      expect(afterDelete.some((folder) => folder.id === added.id)).toBe(false)
    })
  })

  describe("series and episodes (seeded with a real show)", () => {
    let seeded: SeededSeries
    beforeAll(async () => {
      seeded = await seedSeries()
    })

    it("lists the seeded series, decoding the Series payload", async () => {
      const series = successOf(await runExit((sonarr) => sonarr.series.list))
      const match = series.find((entry) => entry.id === seeded.id)

      expect(match).toMatchObject({
        title: seeded.title,
        tvdbId: seeded.tvdbId,
        year: 2017,
      })
    })

    it("gets the seeded series by id, decoding its seasons", async () => {
      const series = successOf(await runExit((sonarr) => sonarr.series.get(seeded.id)))

      expect(series).toMatchObject({
        id: seeded.id,
        tvdbId: seeded.tvdbId,
        status: "ended",
        ended: true,
      })
      expect(series.seasons.length).toBeGreaterThan(0)
    })

    it("lists episodes for the seeded series, decoding the Episode payload", async () => {
      const episodes = successOf(
        await runExit((sonarr) => sonarr.episode.list({ seriesId: seeded.id })),
      )

      expect(episodes.length).toBeGreaterThan(0)
      expect(episodes.every((episode) => episode.seriesId === seeded.id)).toBe(true)
    })
  })
})
