---
"@trugamr/radarr": minor
---

Add Radarr release search + grab and download-queue reads.

`@trugamr/radarr` gains `release.search(movieId)` (interactive indexer search for a movie already in the library), `release.grab({ guid, indexerId })` (hand a chosen release to the download client), and `queue.list` (downloads in flight).
