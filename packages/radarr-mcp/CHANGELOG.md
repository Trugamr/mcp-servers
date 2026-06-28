# @trugamr/radarr-mcp

## 0.2.0

### Minor Changes

- [#31](https://github.com/Trugamr/mcp-servers/pull/31) [`92f7d6d`](https://github.com/Trugamr/mcp-servers/commit/92f7d6d68e934a381734bc936d4042ee90cb736d) Thanks [@Trugamr](https://github.com/Trugamr)! - Add the movie add funnel: an agent can now resolve a title, place it in the library, and remove it — completing the path that previously dead-ended because `search_releases` needs a movie already in the library.

  SDK (`@trugamr/radarr`): `movie.lookup` (`GET /movie/lookup?term=`), `movie.add` (adds by tmdbId — it re-looks the movie up via `GET /movie/lookup/tmdb?tmdbId=` so the `POST /movie` carries the full resource, with `addOptions.searchForMovie: false`), `movie.remove` (`DELETE /movie/{id}`), plus list-only `qualityProfile.list` and `rootFolder.list` resources.

  MCP (`@trugamr/radarr-mcp`): `lookup_movie`, `add_movie`, `remove_movie`, `list_quality_profiles`, and `list_root_folders`. `add_movie` does not start a release search — grabbing stays explicit through the existing `search_releases` → `grab_release`, where codec (HEVC/x265) and resolution are filtered via the release title.

- [#36](https://github.com/Trugamr/mcp-servers/pull/36) [`dfce914`](https://github.com/Trugamr/mcp-servers/commit/dfce914efb56c7499d5dcad9f34e0a683e1a6cb7) Thanks [@Trugamr](https://github.com/Trugamr)! - Make quality profiles configurable, not just pickable. The SDK gains `qualityProfile.get`/`create`/`update`/`remove` and a faithfully-modeled profile (its quality `items` tree, `cutoff`, format-score thresholds, `formatItems`, and `language`), plus a read-only `language.list` / `language.get`. An update fetches the current resource, overlays the patch, and PUTs it back, so unmodeled and unspecified fields survive the round-trip.

  The MCP server exposes `get_quality_profile`, `create_quality_profile`, `update_quality_profile`, `delete_quality_profile`, and `list_languages`. There is no quality-profile schema endpoint, so a create is built by cloning an existing profile (`get_quality_profile`), dropping its id, and adjusting it; `language` ids come from `list_languages`.

### Patch Changes

- [#33](https://github.com/Trugamr/mcp-servers/pull/33) [`0095d92`](https://github.com/Trugamr/mcp-servers/commit/0095d92a140ed4e894635a4f5f5007f5bb21a58e) Thanks [@Trugamr](https://github.com/Trugamr)! - Describe the optional parameters on the action tools so the model sees what each flag does and its default rather than a bare type: `add_movie`'s `monitored` (defaults to monitored) and `minimumAvailability` (its allowed values, defaults to `released`), `remove_movie`'s `deleteFiles` and `addImportListExclusion` (both default to false), and `grab_release`'s `title`. The tool-level descriptions no longer repeat what now lives on the parameters.

- [#34](https://github.com/Trugamr/mcp-servers/pull/34) [`3608d9f`](https://github.com/Trugamr/mcp-servers/commit/3608d9f9c461aa70b1f834cdef1bb89f82309e2e) Thanks [@Trugamr](https://github.com/Trugamr)! - Stop modeling a release's `downloadUrl`. Radarr embeds an API key in that URL, and `search_releases` surfaced it straight into the agent's context — a secret leak. Nothing consumes it (a grab keys off `guid` + `indexerId`), so the `Release` schema drops it and `search_releases` no longer returns it. `infoUrl`, a public details page, stays.

- [#35](https://github.com/Trugamr/mcp-servers/pull/35) [`6760932`](https://github.com/Trugamr/mcp-servers/commit/67609321c427c8a2e48024bf1e11bfd2583d3aee) Thanks [@Trugamr](https://github.com/Trugamr)! - Make a grab confirmable through the queue. Radarr's `POST /release` returns an empty body, so a grab is an acknowledgement, not a confirmation: `grab_release` now returns `accepted: true` and its description points the caller at `list_queue` to confirm. The queue schema surfaces each record's `downloadId` (the download client's torrent hash / nzb id) — the stable handle that correlates a grab to its queue record and follows it on into history — and `list_queue` gains `downloadId` and `id` filters, so after a grab the caller polls by `movieId`, reads the new record's `downloadId`, then tracks that exact item across polls.

- Updated dependencies [[`92f7d6d`](https://github.com/Trugamr/mcp-servers/commit/92f7d6d68e934a381734bc936d4042ee90cb736d), [`dfce914`](https://github.com/Trugamr/mcp-servers/commit/dfce914efb56c7499d5dcad9f34e0a683e1a6cb7), [`3608d9f`](https://github.com/Trugamr/mcp-servers/commit/3608d9f9c461aa70b1f834cdef1bb89f82309e2e), [`6760932`](https://github.com/Trugamr/mcp-servers/commit/67609321c427c8a2e48024bf1e11bfd2583d3aee)]:
  - @trugamr/radarr@0.2.0

## 0.1.0

### Minor Changes

- [#28](https://github.com/Trugamr/mcp-servers/pull/28) [`28d0e9d`](https://github.com/Trugamr/mcp-servers/commit/28d0e9d6bb213c4924aef215e7206b811f384eff) Thanks [@Trugamr](https://github.com/Trugamr)! - Surface genres on the library list tools and make them filterable.

  `list_movies` and `list_series` now include each item's `genres`, and gain a `genres` filter with set semantics — positive operators match existentially (`contains: "drama"`, `in: ["Drama", "Sci-Fi"]`), negative operators match universally (`ne` / `nin` exclude any item carrying the genre). Text filters across both servers also gain the `nin` operator.

- [#20](https://github.com/Trugamr/mcp-servers/pull/20) [`1f4dcd9`](https://github.com/Trugamr/mcp-servers/commit/1f4dcd93548edcb105437b1afeb8663b69d6a8de) Thanks [@Trugamr](https://github.com/Trugamr)! - Add the `@trugamr/radarr-mcp` server: an MCP server exposing the Radarr SDK to agents over stdio and Streamable HTTP. Tools: `get_system_status`, `list_movies`, `search_releases` (interactive indexer search), `grab_release` (hand a chosen release to the download client), and `list_queue`. The list tools carry a structured `filter`/`sort`/cursor-`page` query (mirroring `@trugamr/sonarr-mcp`) applied client-side — e.g. `search_releases` filters by resolution and by codec via the release title.

### Patch Changes

- Updated dependencies [[`942c732`](https://github.com/Trugamr/mcp-servers/commit/942c732cd6c04cefb61ba398ce0e8f7a11ca0b10), [`1f4dcd9`](https://github.com/Trugamr/mcp-servers/commit/1f4dcd93548edcb105437b1afeb8663b69d6a8de)]:
  - @trugamr/radarr@0.1.0
