---
"@trugamr/radarr": patch
"@trugamr/radarr-mcp": patch
---

Stop modeling a release's `downloadUrl`. Radarr embeds an API key in that URL, and `search_releases` surfaced it straight into the agent's context — a secret leak. Nothing consumes it (a grab keys off `guid` + `indexerId`), so the `Release` schema drops it and `search_releases` no longer returns it. `infoUrl`, a public details page, stays.
