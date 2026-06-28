---
"@trugamr/radarr": patch
"@trugamr/radarr-mcp": patch
---

Make a grab confirmable through the queue. Radarr's `POST /release` returns an empty body, so a grab is an acknowledgement, not a confirmation: `grab_release` now returns `accepted: true` and its description points the caller at `list_queue` to confirm. The queue schema surfaces each record's `downloadId` (the download client's torrent hash / nzb id) — the stable handle that correlates a grab to its queue record and follows it on into history — and `list_queue` gains `downloadId` and `id` filters, so after a grab the caller polls by `movieId`, reads the new record's `downloadId`, then tracks that exact item across polls.
