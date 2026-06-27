import { servarrApi } from "../servarr/api.js"
import { injectRadarr } from "./integration.js"

// Writable root-folder path a seeding suite mounts as tmpfs (via the global setup's
// `tmpfs` option) so Radarr accepts it as a root folder without a real disk.
export const MOVIE_ROOT_FOLDER = "/movies"

// Lemony Snicket's A Series of Unfortunate Events (2004) — a released film, so its
// identity (tmdbId, year, status) is stable to assert against. Mirrors the show the
// Sonarr seed uses.
const MOVIE_TMDB_ID = 11774
const MOVIE_TITLE = "Lemony Snicket's A Series of Unfortunate Events"

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
  const radarr = servarrApi(injectRadarr())

  const folders: Array<{ path?: string }> = await radarr.readJson("/api/v3/rootfolder")
  if (!folders.some((folder) => folder.path === MOVIE_ROOT_FOLDER)) {
    await radarr.send("/api/v3/rootfolder", {
      method: "POST",
      body: JSON.stringify({ path: MOVIE_ROOT_FOLDER }),
    })
  }

  const lookup: Record<string, unknown> = await radarr.readJson(
    `/api/v3/movie/lookup/tmdb?tmdbId=${MOVIE_TMDB_ID}`,
  )

  const added: { id: number } = await radarr.readJson("/api/v3/movie", {
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

  return { id: added.id, tmdbId: MOVIE_TMDB_ID, title: MOVIE_TITLE }
}
