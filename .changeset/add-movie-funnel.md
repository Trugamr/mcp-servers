---
"@trugamr/radarr": minor
"@trugamr/radarr-mcp": minor
---

Add the movie add funnel: an agent can now resolve a title, place it in the library, and remove it — completing the path that previously dead-ended because `search_releases` needs a movie already in the library.

SDK (`@trugamr/radarr`): `movie.lookup` (`GET /movie/lookup?term=`), `movie.add` (adds by tmdbId — it re-looks the movie up via `GET /movie/lookup/tmdb?tmdbId=` so the `POST /movie` carries the full resource, with `addOptions.searchForMovie: false`), `movie.remove` (`DELETE /movie/{id}`), plus list-only `qualityProfile.list` and `rootFolder.list` resources.

MCP (`@trugamr/radarr-mcp`): `lookup_movie`, `add_movie`, `remove_movie`, `list_quality_profiles`, and `list_root_folders`. `add_movie` does not start a release search — grabbing stays explicit through the existing `search_releases` → `grab_release`, where codec (HEVC/x265) and resolution are filtered via the release title.
