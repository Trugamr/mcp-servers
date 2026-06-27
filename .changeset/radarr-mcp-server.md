---
"@trugamr/radarr-mcp": minor
---

Add the `@trugamr/radarr-mcp` server: an MCP server exposing the Radarr SDK to agents over stdio and Streamable HTTP. Tools: `get_system_status`, `list_movies`, `search_releases` (interactive indexer search), `grab_release` (hand a chosen release to the download client), and `list_queue`. The list tools carry a structured `filter`/`sort`/cursor-`page` query (mirroring `@trugamr/sonarr-mcp`) applied client-side — e.g. `search_releases` filters by resolution and by codec via the release title.
