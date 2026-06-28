---
"@trugamr/radarr-mcp": minor
"@trugamr/sonarr-mcp": minor
---

Surface genres on the library list tools and make them filterable.

`list_movies` and `list_series` now include each item's `genres`, and gain a `genres` filter with set semantics — positive operators match existentially (`contains: "drama"`, `in: ["Drama", "Sci-Fi"]`), negative operators match universally (`ne` / `nin` exclude any item carrying the genre). Text filters across both servers also gain the `nin` operator.
