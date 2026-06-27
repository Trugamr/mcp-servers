/**
 * A `GET /api/v3/queue` envelope with one in-flight download. `errorMessage: null`
 * exercises `optionalNullable`, and the unmodeled `statusMessages`/`page` keys verify
 * `Schema.Struct` drops what it doesn't model.
 */
export const queuePageFixture = {
  page: 1,
  pageSize: 20,
  totalRecords: 1,
  records: [
    {
      id: 101,
      movieId: 1,
      title: "The Dark Knight 2008 1080p BluRay x265 HEVC-GROUP",
      status: "downloading",
      trackedDownloadStatus: "ok",
      trackedDownloadState: "downloading",
      size: 8_500_000_000,
      sizeleft: 4_200_000_000,
      timeleft: "00:25:00",
      estimatedCompletionTime: "2024-01-01T00:25:00Z",
      indexer: "Indexer (Prowlarr)",
      downloadClient: "qBittorrent",
      protocol: "torrent",
      quality: { quality: { name: "Bluray-1080p", resolution: 1080 } },
      errorMessage: null,
      statusMessages: [],
    },
  ],
}
