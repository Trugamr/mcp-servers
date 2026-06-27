import { SONARR_VERSION } from "@trugamr/testkit/sonarr"
import { beforeAll, describe, expect, it } from "vitest"
import { SonarrResponseError } from "../../effect.js"
import { failureOf, runExit, successOf } from "./helpers.js"
import { seedSeries, type SeededSeries, SPARE_ROOT_FOLDER } from "./seed.js"

// Drives the SDK against a real Sonarr (booted by ./setup.ts) pinned to a fixed
// version. Each test decodes an actual Sonarr payload through the SDK's schemas,
// so schema drift fails loudly. Reads that a fresh instance leaves empty are
// covered by seeding real data first (see "series and episodes").
describe("Sonarr SDK against a pinned Sonarr instance", () => {
  describe("system.getStatus", () => {
    it("decodes the status payload and reports the pinned version", async () => {
      const status = successOf(await runExit((sonarr) => sonarr.system.getStatus))

      expect(status).toMatchObject({ appName: "Sonarr", version: SONARR_VERSION })
    })
  })

  describe("qualityProfile.list", () => {
    it("decodes the default profiles seeded on first run", async () => {
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
  })

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

  describe("tag write round-trip", () => {
    it("creates, lists, then deletes a tag", async () => {
      const created = successOf(await runExit((sonarr) => sonarr.tag.create("integration")))
      expect(created.label).toBe("integration")

      const afterCreate = successOf(await runExit((sonarr) => sonarr.tag.list))
      expect(afterCreate.some((tag) => tag.id === created.id)).toBe(true)

      successOf(await runExit((sonarr) => sonarr.tag.delete(created.id)))

      const afterDelete = successOf(await runExit((sonarr) => sonarr.tag.list))
      expect(afterDelete.some((tag) => tag.id === created.id)).toBe(false)
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

    it("returns a typed 404 for an unknown series id", async () => {
      const error = failureOf(await runExit((sonarr) => sonarr.series.get(999_999)))

      expect(error).toBeInstanceOf(SonarrResponseError)
      expect(error).toMatchObject({ status: 404 })
    })
  })
})
