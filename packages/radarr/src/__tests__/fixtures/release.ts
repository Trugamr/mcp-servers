/**
 * Two `GET /api/v3/release` candidates for one movie: a torrent (with seeders) and a
 * usenet release (no seeders — exercises `optionalNullable`). The nested `quality`
 * and the unmodeled `customFormats`/`revision` keys verify the schema decodes the
 * shape and drops what it doesn't model. Codec lives in `title`, not a structured
 * field — note the "x265 HEVC" vs "x264" difference an agent filters on.
 */
export const releasesFixture = [
  {
    guid: "https://indexer.test/abc",
    indexerId: 2,
    title: "The Dark Knight 2008 1080p BluRay x265 HEVC-GROUP",
    quality: {
      quality: { id: 7, name: "Bluray-1080p", resolution: 1080, source: "bluray" },
      revision: { version: 1, real: 0, isRepack: false },
    },
    size: 8_500_000_000,
    seeders: 42,
    leechers: 3,
    age: 120,
    ageHours: 2880,
    indexer: "Indexer (Prowlarr)",
    protocol: "torrent",
    releaseGroup: "GROUP",
    languages: [{ id: 1, name: "English" }],
    customFormatScore: 50,
    customFormats: [{ id: 1, name: "HEVC" }],
    approved: true,
    rejected: false,
    rejections: [],
    downloadAllowed: true,
    publishDate: "2024-01-01T00:00:00Z",
    infoUrl: "https://indexer.test/info/abc",
    downloadUrl: "https://indexer.test/dl/abc",
  },
  {
    guid: "usenet-xyz",
    indexerId: 3,
    title: "The Dark Knight 2008 1080p BluRay DD5.1 x264-OTHER",
    quality: { quality: { name: "Bluray-1080p", resolution: 1080 } },
    size: 12_000_000_000,
    age: 200,
    indexer: "Newznab",
    protocol: "usenet",
    approved: false,
    rejected: true,
    rejections: ["Not an upgrade for existing file"],
    downloadAllowed: false,
    publishDate: "2024-01-01T00:00:00Z",
  },
]
