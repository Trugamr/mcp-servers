# Radarr API coverage

Tracks how much of the [Radarr v3 API](https://radarr.video/docs/api/) (spec: [`openapi.json`](https://github.com/Radarr/Radarr/blob/develop/src/Radarr.Api.V3/openapi.json)) the `@trugamr/radarr` SDK exposes. Organized by **resource section** — each section lists its reads _and_ writes together; we work through sections, not a global reads-then-writes split.

The Radarr MCP server isn't built yet, so shipped rows note their SDK method only. When the MCP server lands it will mirror `@trugamr/sonarr-mcp`, and these rows will gain their `→ tool` mapping.

Legend: `[x]` shipped · `[ ]` planned. Paths omit the `/api/v3` prefix (Radarr's API is v3, the same major as Sonarr's, distinct from the app version).

## List query conventions

`/movie` returns a flat array with no server-side query support, so when the MCP server lands, filtering, sorting, and paging will happen in the MCP layer — the same structured, client-side query `@trugamr/sonarr-mcp` uses for `list_series` (per-field `filter` operators, multi-field `sort`, opaque cursor `page` with a `{ items, nextCursor?, totalRecords }` envelope).

## System

- [x] `GET /system/status` — `system.getStatus`
- [ ] `GET /system/backup`, `POST /system/backup`, `DELETE /system/backup/{id}`
- [ ] `POST /system/restart`, `POST /system/shutdown`

## Movie

- [x] `GET /movie` — `movie.list`
- [x] `GET /movie/{id}` — `movie.get`
- [ ] `POST /movie` — add a movie (needs **Movie Lookup**)
- [ ] `PUT /movie/{id}` — update a movie (full-resource round-trip)
- [ ] `DELETE /movie/{id}` — delete a movie (`deleteFiles`, `addImportExclusion`)
- [ ] `GET /movie/lookup?term=`, `GET /movie/lookup/tmdb?tmdbId=` — search for a movie to add (**Movie Lookup**)

The `Movie` schema models a lean identify-and-reason-about field set; `Schema.Struct` drops the rest, so these payload fields are **shipped by Radarr but not yet modeled**:

- `ratings` — per-provider scores (`imdb` / `tmdb` / `metacritic` / `rottenTomatoes` / `trakt`, each `{ votes, value, type }`). Worth surfacing for the agent; deferred only because it nests differently from Sonarr's flat `{ votes, value }` and needs its own sub-schema rather than a copy.
- `movieFile` — the downloaded file's quality, size, and media info.
- `images`, `collection`, `alternateTitles`, `originalTitle`, `popularity`.

## Movie File

- [ ] `GET /moviefile?movieId=` — list movie files
- [ ] `GET /moviefile/{id}` — get a movie file
- [ ] `PUT /moviefile/{id}` — edit quality/language
- [ ] `DELETE /moviefile/{id}` — delete a movie file

## Quality Profile

- [ ] `GET /qualityprofile` — list quality profiles
- [ ] `GET /qualityprofile/{id}` — get one profile
- [ ] `POST` / `PUT` / `DELETE /qualityprofile` — manage profiles

## Root Folder

- [ ] `GET /rootfolder` — list root folders
- [ ] `POST /rootfolder` — add a root folder
- [ ] `DELETE /rootfolder/{id}` — delete a root folder

## Tag

- [ ] `GET /tag` — list tags
- [ ] `POST /tag` — create a tag
- [ ] `DELETE /tag/{id}` — delete a tag
- [ ] `GET /tag/{id}`, `GET /tag/detail` — get a tag / tag usage detail

## Health

- [ ] `GET /health` — list health checks

## Disk Space

- [ ] `GET /diskspace` — list mounted filesystems

## Calendar

- [ ] `GET /calendar?start=&end=` — upcoming/released movies in a date range

## Release

Interactive search hits the configured indexers live for a movie **already in the library**, then a grab hands the chosen release to the download client (where it surfaces in the queue). Codec (HEVC/x265) isn't a structured field — it lives only in a release's `title`, so a caller filtering for e.g. "1080p hevc" reads `quality` for the resolution and the title string for the codec.

- [x] `GET /release?movieId=` — interactive search for a movie's releases — `release.search`
- [x] `POST /release` — grab a release (`guid` + `indexerId`) and send it to the download client — `release.grab`
- [ ] `POST /release/push` — push a release Radarr didn't find itself

## Queue

- [x] `GET /queue` — download queue, page one — `queue.list`
- [ ] `GET /queue` — full paging (`page`, `pageSize`, `sortKey`)
- [ ] `DELETE /queue/{id}` — remove a queue item
- [ ] `GET /queue/details`, `GET /queue/status`

## History

- [ ] `GET /history` — paginated grab/import/delete history
- [ ] `GET /history/since`, `GET /history/movie`

## Wanted

- [ ] `GET /wanted/missing` — missing movies (paginated)
- [ ] `GET /wanted/cutoff` — cutoff-unmet movies (paginated)

## Command

- [ ] `GET /command`, `GET /command/{id}` — list / poll commands
- [ ] `POST /command` — trigger a command (search, refresh, rescan, …)

## Other resources (not yet started)

Collection, Credit, Custom Format, Quality Definition, Indexer, Download Client, Import List, Notification, Blocklist, Metadata, Media Management & Naming config, Update, Log.
