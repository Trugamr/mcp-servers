# @trugamr/radarr-mcp

## 0.1.0

### Minor Changes

- [#28](https://github.com/Trugamr/mcp-servers/pull/28) [`28d0e9d`](https://github.com/Trugamr/mcp-servers/commit/28d0e9d6bb213c4924aef215e7206b811f384eff) Thanks [@Trugamr](https://github.com/Trugamr)! - Surface genres on the library list tools and make them filterable.

  `list_movies` and `list_series` now include each item's `genres`, and gain a `genres` filter with set semantics — positive operators match existentially (`contains: "drama"`, `in: ["Drama", "Sci-Fi"]`), negative operators match universally (`ne` / `nin` exclude any item carrying the genre). Text filters across both servers also gain the `nin` operator.

- [#20](https://github.com/Trugamr/mcp-servers/pull/20) [`1f4dcd9`](https://github.com/Trugamr/mcp-servers/commit/1f4dcd93548edcb105437b1afeb8663b69d6a8de) Thanks [@Trugamr](https://github.com/Trugamr)! - Add the `@trugamr/radarr-mcp` server: an MCP server exposing the Radarr SDK to agents over stdio and Streamable HTTP. Tools: `get_system_status`, `list_movies`, `search_releases` (interactive indexer search), `grab_release` (hand a chosen release to the download client), and `list_queue`. The list tools carry a structured `filter`/`sort`/cursor-`page` query (mirroring `@trugamr/sonarr-mcp`) applied client-side — e.g. `search_releases` filters by resolution and by codec via the release title.

### Patch Changes

- Updated dependencies [[`942c732`](https://github.com/Trugamr/mcp-servers/commit/942c732cd6c04cefb61ba398ce0e8f7a11ca0b10), [`1f4dcd9`](https://github.com/Trugamr/mcp-servers/commit/1f4dcd93548edcb105437b1afeb8663b69d6a8de)]:
  - @trugamr/radarr@0.1.0
