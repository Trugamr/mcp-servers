# Sonarr API coverage

Tracks how much of the [Sonarr v3 API](https://sonarr.tv/docs/api/) (spec:
[`openapi.json`](https://github.com/Sonarr/Sonarr/blob/develop/src/Sonarr.Api.V3/openapi.json),
applies to v3 and v4) the `@trugamr/sonarr` SDK and the `@trugamr/sonarr-mcp`
server expose. Organized by **resource section** — each section lists its reads
_and_ writes together; we work through sections, not a global reads-then-writes
split.

Legend: `[x]` shipped · `[ ]` planned. Each shipped row notes its SDK method →
MCP tool. Paths omit the `/api/v3` prefix.

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
- [ ] `GET /episode/{id}` — get a single episode
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

- [x] `GET /rootfolder` — `rootFolder.list` → `list_root_folders`
- [x] `POST /rootfolder` — `rootFolder.add` → `add_root_folder`
- [x] `DELETE /rootfolder/{id}` — `rootFolder.delete` → `delete_root_folder`

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
