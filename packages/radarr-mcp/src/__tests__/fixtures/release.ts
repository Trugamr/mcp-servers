/**
 * Two `GET /api/v3/release` candidates: a torrent (with seeders) and a usenet
 * release (no seeders). Codec lives in `title` — "x265 HEVC" vs "x264" — which the
 * agent filters on, since Radarr exposes no structured codec field. The first carries
 * `downloadUrl` (Radarr embeds an API key in it) to prove the surface strips it.
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
