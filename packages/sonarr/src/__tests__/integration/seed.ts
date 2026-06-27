import { inject } from "vitest"

// Writable root-folder paths, provisioned as tmpfs mounts by ./setup.ts so Sonarr
// accepts them as root folders without a real disk.
export const SERIES_ROOT_FOLDER = "/data/tv"
export const SPARE_ROOT_FOLDER = "/data/extra"

// A Series of Unfortunate Events (2017) — an ended show, so its identity (id, year,
// status) is stable to assert against.
const SERIES_TVDB_ID = 306304
const SERIES_TITLE = "A Series of Unfortunate Events"

/** Drive Sonarr's API directly with the injected credentials, throwing on non-2xx. */
const sonarr = async (path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(`${inject("sonarrBaseUrl")}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": inject("sonarrApiKey"),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${response.status}`)
  }
  return response
}

export interface SeededSeries {
  readonly id: number
  readonly tvdbId: number
  readonly title: string
}

/**
 * Seed one real series so the series/episode reads decode populated payloads
 * instead of empty arrays. The SDK is read-only for series, so this uses Sonarr's
 * API directly: register a root folder, add the series (Sonarr pulls metadata and
 * episodes from its online provider), then wait for the async refresh to populate
 * episodes. Requires network access to Sonarr's metadata service.
 */
export const seedSeries = async (): Promise<SeededSeries> => {
  const folders = (await (await sonarr("/api/v3/rootfolder")).json()) as Array<{ path?: string }>
  if (!folders.some((folder) => folder.path === SERIES_ROOT_FOLDER)) {
    await sonarr("/api/v3/rootfolder", {
      method: "POST",
      body: JSON.stringify({ path: SERIES_ROOT_FOLDER }),
    })
  }

  const added = (await (
    await sonarr("/api/v3/series", {
      method: "POST",
      body: JSON.stringify({
        tvdbId: SERIES_TVDB_ID,
        title: SERIES_TITLE,
        qualityProfileId: 1,
        rootFolderPath: SERIES_ROOT_FOLDER,
        monitored: true,
        addOptions: { searchForMissingEpisodes: false, searchForCutoffUnmetEpisodes: false },
      }),
    })
  ).json()) as { id: number }

  // Adding the series kicks off an async refresh that fetches its episodes; poll
  // until they land.
  for (let attempt = 0; attempt < 30; attempt++) {
    const episodes = (await (
      await sonarr(`/api/v3/episode?seriesId=${added.id}`)
    ).json()) as Array<unknown>
    if (episodes.length > 0) {
      return { id: added.id, tvdbId: SERIES_TVDB_ID, title: SERIES_TITLE }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error("Sonarr did not populate episodes for the seeded series in time")
}
