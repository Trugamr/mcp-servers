# Radarr API coverage

Tracks how much of the [Radarr v3 API](https://radarr.video/docs/api/) (spec: [`openapi.json`](https://github.com/Radarr/Radarr/blob/develop/src/Radarr.Api.V3/openapi.json)) the `@trugamr/radarr` SDK exposes. Organized by **resource section** — each section lists its reads _and_ writes together; we work through sections, not a global reads-then-writes split.

The `@trugamr/radarr-mcp` server exposes a thin slice of these as agent tools over stdio and Streamable HTTP, mirroring `@trugamr/sonarr-mcp`'s scaffolding. Shipped rows note their SDK method and, where one exists, the `→ tool` that calls it.

Legend: `[x]` shipped · `[ ]` planned. Paths omit the `/api/v3` prefix (Radarr's API is v3, the same major as Sonarr's, distinct from the app version).

## List query conventions

`/movie`, `/release`, and `/queue` return flat lists with no server-side query support, so the `@trugamr/radarr-mcp` list tools apply filtering, sorting, and paging **client-side** after the fetch — the same structured query `@trugamr/sonarr-mcp` uses for `list_series`: per-field `filter` operators (`eq`/`ne`/`in`/`nin`/`gte`/`contains`/…), multi-field `sort`, and an opaque-cursor `page`, with a `{ items, nextCursor?, totalRecords }` envelope. Multi-valued fields like a movie's `genres` filter with **set semantics** — positive operators (`eq`/`in`/`contains`) match when any value qualifies, negatives (`ne`/`nin`) exclude any item carrying the value. The SDK methods stay thin (just the endpoint + its native params, as Sonarr's SDK exposes them); the query richness lives in the MCP layer.

Codec (HEVC/x265) is the one field with no structured home — Radarr puts it only in a release's `title` — so `search_releases` filters it via `filter.title.contains` (resolution comes from `filter.resolution`).

## System

- [x] `GET /system/status` — `system.getStatus` → `get_system_status`
- [ ] `GET /system/backup`, `POST /system/backup`, `DELETE /system/backup/{id}`
- [ ] `POST /system/restart`, `POST /system/shutdown`

## Movie

- [x] `GET /movie` — `movie.list` → `list_movies`
- [x] `GET /movie/{id}` — `movie.get`
- [x] `GET /movie/lookup?term=` — search the metadata provider for a movie to add — `movie.lookup` → `lookup_movie`
- [x] `POST /movie` — add a movie by tmdbId — `movie.add` → `add_movie`. The add re-looks the movie up via `GET /movie/lookup/tmdb?tmdbId=` (so the post carries the full resource) and sets `addOptions.searchForMovie: false`; grabbing stays explicit via `search_releases` → `grab_release`.
- [x] `DELETE /movie/{id}` — delete a movie (`deleteFiles`, `addImportListExclusion`) — `movie.remove` → `remove_movie`
- [ ] `PUT /movie/{id}` — update a movie (full-resource round-trip)

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

A profile is modeled faithfully enough to clone and re-send: its quality `items` tree (single qualities and named groups), `cutoff`, the `minFormatScore`/`cutoffFormatScore`/`minUpgradeFormatScore` thresholds, `formatItems` scores, and `language`. There is no `/qualityprofile/schema` endpoint, so a create is built by cloning an existing profile (`get_quality_profile`), dropping its id, and adjusting it. An update fetches the current resource, overlays the patch, and PUTs it back, so unmodeled and unspecified fields survive.

- [x] `GET /qualityprofile` — list quality profiles (lean id + name) — `qualityProfile.list` → `list_quality_profiles` (so a caller can pick a profile id for `add_movie`)
- [x] `GET /qualityprofile/{id}` — get one profile in full — `qualityProfile.get` → `get_quality_profile`
- [x] `POST /qualityprofile` — create a profile from a full body — `qualityProfile.create` → `create_quality_profile`
- [x] `PUT /qualityprofile/{id}` — update a profile (fetch-merge-put) — `qualityProfile.update` → `update_quality_profile`
- [x] `DELETE /qualityprofile/{id}` — delete a profile — `qualityProfile.remove` → `delete_quality_profile`

## Language

Radarr's language list is fixed (read-only); a quality profile's `language` references one by id.

- [x] `GET /language` — list languages — `language.list` → `list_languages`
- [x] `GET /language/{id}` — get one language — `language.get` (SDK only; no tool yet)

## Root Folder

- [x] `GET /rootfolder` — list root folders — `rootFolder.list` → `list_root_folders` (so a caller can pick a root path for `add_movie`)
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

Interactive search hits the configured indexers live for a movie **already in the library**, then a grab hands the chosen release to the download client (where it surfaces in the queue). Codec (HEVC/x265) isn't a structured field — it lives only in a release's `title`, so a caller filtering for e.g. "1080p hevc" reads `quality` for the resolution and the title string for the codec. `POST /release` returns an empty `201`, so a grab is an acknowledgement, not a confirmation — `grab_release` returns `accepted: true` and the caller confirms by polling `list_queue`.

- [x] `GET /release?movieId=` — interactive search for a movie's releases — `release.search` → `search_releases`
- [x] `POST /release` — grab a release (`guid` + `indexerId`) and send it to the download client; returns `accepted: true` — `release.grab` → `grab_release`
- [ ] `POST /release/push` — push a release Radarr didn't find itself

## Queue

A queue record carries `downloadId` (the download client's torrent hash / nzb id) — the stable handle that correlates a grab to its queue record and follows it on into history. `list_queue` filters by `downloadId` and the record's own `id`, so after a grab the caller polls by `movieId`, reads the new record's `downloadId`, then tracks that exact item by `downloadId`.

- [x] `GET /queue` — download queue, page one — `queue.list` → `list_queue`
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
