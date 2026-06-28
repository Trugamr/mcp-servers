---
"@trugamr/radarr-mcp": patch
---

Describe the optional parameters on the action tools so the model sees what each flag does and its default rather than a bare type: `add_movie`'s `monitored` (defaults to monitored) and `minimumAvailability` (its allowed values, defaults to `released`), `remove_movie`'s `deleteFiles` and `addImportListExclusion` (both default to false), and `grab_release`'s `title`. The tool-level descriptions no longer repeat what now lives on the parameters.
