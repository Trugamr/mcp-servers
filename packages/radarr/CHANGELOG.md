# @trugamr/radarr

## 0.1.0

### Minor Changes

- [#15](https://github.com/Trugamr/mcp-servers/pull/15) [`942c732`](https://github.com/Trugamr/mcp-servers/commit/942c732cd6c04cefb61ba398ce0e8f7a11ca0b10) Thanks [@Trugamr](https://github.com/Trugamr)! - Initial public release.

- [#20](https://github.com/Trugamr/mcp-servers/pull/20) [`1f4dcd9`](https://github.com/Trugamr/mcp-servers/commit/1f4dcd93548edcb105437b1afeb8663b69d6a8de) Thanks [@Trugamr](https://github.com/Trugamr)! - Add Radarr release search + grab and download-queue reads.

  `@trugamr/radarr` gains `release.search(movieId)` (interactive indexer search for a movie already in the library), `release.grab({ guid, indexerId })` (hand a chosen release to the download client), and `queue.list` (downloads in flight).
