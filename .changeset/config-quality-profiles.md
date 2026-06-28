---
"@trugamr/radarr": minor
"@trugamr/radarr-mcp": minor
---

Make quality profiles configurable, not just pickable. The SDK gains `qualityProfile.get`/`create`/`update`/`remove` and a faithfully-modeled profile (its quality `items` tree, `cutoff`, format-score thresholds, `formatItems`, and `language`), plus a read-only `language.list` / `language.get`. An update fetches the current resource, overlays the patch, and PUTs it back, so unmodeled and unspecified fields survive the round-trip.

The MCP server exposes `get_quality_profile`, `create_quality_profile`, `update_quality_profile`, `delete_quality_profile`, and `list_languages`. There is no quality-profile schema endpoint, so a create is built by cloning an existing profile (`get_quality_profile`), dropping its id, and adjusting it; `language` ids come from `list_languages`.
