/**
 * The base path every request shares, e.g. `${apiBase}/movie`. The single place
 * the `/api/v3` prefix is spelled; each resource module derives its own base from
 * it. Radarr's API is v3 (the same major as Sonarr's), distinct from the app version.
 */
export const apiBase = "/api/v3"
