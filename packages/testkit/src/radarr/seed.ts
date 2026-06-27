import { injectRadarr } from "./integration.js"

// Writable root-folder path a seeding suite mounts as tmpfs (via the global setup's
// `tmpfs` option) so Radarr accepts it as a root folder without a real disk.
export const MOVIE_ROOT_FOLDER = "/movies"

// The Shawshank Redemption (1994) — a released film, so its identity (tmdbId, year,
// status) is stable to assert against.
const MOVIE_TMDB_ID = 278
const MOVIE_TITLE = "The Shawshank Redemption"

/** Drive Radarr's API directly with the injected credentials, throwing on non-2xx. */
const radarr = async (path: string, init?: RequestInit): Promise<Response> => {
  const { baseUrl, apiKey } = injectRadarr()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${response.status}`)
  }
  return response
}

export interface SeededMovie {
  readonly id: number
  readonly tmdbId: number
  readonly title: string
}

/**
 * Seed one real movie so the movie reads decode a populated payload instead of an
 * empty array. The SDK is read-only for movies, so this uses Radarr's API directly:
 * register a root folder, look the movie up by TMDB id (which fetches its metadata
 * from Radarr's online provider — requires network access), then add it. Unlike
 * Sonarr's series seed, a movie's metadata arrives with the add, so no refresh
 * command is awaited.
 */
export const seedMovie = async (): Promise<SeededMovie> => {
  const folders = (await (await radarr("/api/v3/rootfolder")).json()) as Array<{ path?: string }>
  if (!folders.some((folder) => folder.path === MOVIE_ROOT_FOLDER)) {
    await radarr("/api/v3/rootfolder", {
      method: "POST",
      body: JSON.stringify({ path: MOVIE_ROOT_FOLDER }),
    })
  }

  const lookup = (await (
    await radarr(`/api/v3/movie/lookup/tmdb?tmdbId=${MOVIE_TMDB_ID}`)
  ).json()) as Record<string, unknown>

  const added = (await (
    await radarr("/api/v3/movie", {
      method: "POST",
      body: JSON.stringify({
        ...lookup,
        qualityProfileId: 1,
        rootFolderPath: MOVIE_ROOT_FOLDER,
        monitored: true,
        minimumAvailability: "released",
        addOptions: { searchForMovie: false },
      }),
    })
  ).json()) as { id: number }

  return { id: added.id, tmdbId: MOVIE_TMDB_ID, title: MOVIE_TITLE }
}
