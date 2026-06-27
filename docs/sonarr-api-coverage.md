# Sonarr API coverage

Tracks how much of the [Sonarr v3 API](https://sonarr.tv/docs/api/) (spec:
[`openapi.json`](https://github.com/Sonarr/Sonarr/blob/develop/src/Sonarr.Api.V3/openapi.json))
the `@trugamr/sonarr` SDK and the `@trugamr/sonarr-mcp`
server expose. Organized by **resource section** — each section lists its reads
_and_ writes together; we work through sections, not a global reads-then-writes
split.

Legend: `[x]` shipped · `[ ]` planned. Each shipped row notes its SDK method →
MCP tool. Paths omit the `/api/v3` prefix.

## List query conventions

`list_series` and `list_episodes` take a structured, client-side query — Sonarr's
`/series` and `/episode` return flat arrays with no server-side query support, so
filtering, sorting, and paging happen in the MCP layer:

- **filter** — a per-field object with explicit operators: `eq`/`ne`/`in`/`nin`,
  `gte`/`lte`/`gt`/`lt` (ordered fields), `contains` (text), `hasAny`/`hasAll`
  (array membership). e.g. `{ filter: { status: { in: ["ended"] }, year: { gte: 2015 } } }`.
- **sort** — `[{ field, order }]`; `order` is `asc` (default) or `desc`, multi-field.
- **include** (`list_series` only) — re-adds heavy blocks (`statistics` / `seasons` /
  `ratings`) to the otherwise-lean summary item; full detail is always via `get_series`.
- **page** — opaque cursor pagination: `{ size?, cursor? }` in; the result envelope is
  `{ items, nextCursor?, totalRecords }` (`nextCursor` absent on the last page,
  `totalRecords` is the filtered count). The same envelope will back the future
  server-paginated Queue / History / Wanted tools.

## System

- [x] `GET /system/status` — `system.getStatus` → `get_system_status`
- [ ] `GET /system/backup`, `POST /system/backup`, `DELETE /system/backup/{id}`
- [ ] `POST /system/restart`, `POST /system/shutdown`

## Series

- [x] `GET /series` — `series.list` → `list_series`
- [x] `GET /series/{id}` — `series.get` → `get_series`
- [ ] `POST /series` — add a series (needs **Series Lookup**)
- [ ] `PUT /series/{id}` — update a series (full-resource round-trip)
- [ ] `DELETE /series/{id}` — delete a series (`deleteFiles`, `addImportListExclusion`)
- [ ] `GET /series/lookup?term=` — search for a series to add (**Series Lookup**)

## Episode

- [x] `GET /episode?seriesId=&seasonNumber=` — `episode.list` → `list_episodes`
- [ ] `GET /episode/{id}` — get a single episode (a `get_episode` detail tool; would let `list_episodes` drop `overview`)
- [ ] `PUT /episode/monitor` — bulk monitor/unmonitor episodes

## Episode File

- [ ] `GET /episodefile?seriesId=` — list episode files
- [ ] `GET /episodefile/{id}` — get an episode file
- [ ] `PUT /episodefile/{id}` — edit quality/language
- [ ] `DELETE /episodefile/{id}` — delete an episode file

## Quality Profile

- [x] `GET /qualityprofile` — `qualityProfile.list` → `list_quality_profiles`
- [ ] `GET /qualityprofile/{id}` — get one profile
- [ ] `POST` / `PUT` / `DELETE /qualityprofile` — manage profiles

## Root Folder

The SDK keeps these ops, but no MCP tool is exposed — root folder management
isn't a priority for the agent surface right now.

- [x] `GET /rootfolder` — `rootFolder.list` (SDK only)
- [x] `POST /rootfolder` — `rootFolder.add` (SDK only)
- [x] `DELETE /rootfolder/{id}` — `rootFolder.delete` (SDK only)

## Tag

- [x] `GET /tag` — `tag.list` → `list_tags`
- [x] `POST /tag` — `tag.create` → `create_tag`
- [x] `DELETE /tag/{id}` — `tag.delete` → `delete_tag`
- [ ] `GET /tag/{id}`, `GET /tag/detail` — get a tag / tag usage detail
- [ ] `PUT /tag/{id}` — rename a tag

## Health

- [x] `GET /health` — `health.list` → `list_health`

## Disk Space

- [x] `GET /diskspace` — `diskSpace.list` → `list_disk_space`

## Calendar

- [ ] `GET /calendar?start=&end=` — upcoming/aired episodes in a date range

## Queue

- [ ] `GET /queue` — paginated download queue
- [ ] `DELETE /queue/{id}` — remove a queue item
- [ ] `GET /queue/details`, `GET /queue/status`

## History

- [ ] `GET /history` — paginated grab/import/delete history
- [ ] `GET /history/since`, `GET /history/series`

## Wanted

- [ ] `GET /wanted/missing` — missing episodes (paginated)
- [ ] `GET /wanted/cutoff` — cutoff-unmet episodes (paginated)

## Command

- [ ] `GET /command`, `GET /command/{id}` — list / poll commands
- [ ] `POST /command` — trigger a command (search, refresh, rescan, …)

## Other resources (not yet started)

Indexer, Download Client, Import List, Notification, Custom Format, Quality
Definition, Release / Release Push, Blocklist, Metadata, Media Management &
Naming config, Update, Log.
