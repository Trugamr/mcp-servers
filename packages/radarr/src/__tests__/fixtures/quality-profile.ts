/**
 * `GET /api/v3/qualityprofile` payload. Two profiles; the second resolves 1080p and
 * exercises the full round-trippable shape — a quality group nesting its own items,
 * `formatItems` scores, a `language`, and an unmodeled `quality.modifier` the schema
 * drops.
 */
export const qualityProfilesFixture = [
  {
    id: 1,
    name: "Any",
    upgradeAllowed: false,
    cutoff: 1,
    minFormatScore: 0,
    cutoffFormatScore: 0,
    items: [
      { quality: { id: 0, name: "Unknown", source: "unknown", resolution: 0 }, allowed: false },
      {
        id: 1000,
        name: "WEB 1080p",
        allowed: true,
        items: [
          {
            quality: { id: 3, name: "WEBDL-1080p", source: "web", resolution: 1080 },
            items: [],
            allowed: true,
          },
          {
            quality: { id: 15, name: "WEBRip-1080p", source: "webrip", resolution: 1080 },
            items: [],
            allowed: true,
          },
        ],
      },
    ],
  },
  {
    id: 4,
    name: "HD-1080p",
    upgradeAllowed: true,
    cutoff: 7,
    minFormatScore: 0,
    cutoffFormatScore: 0,
    minUpgradeFormatScore: 1,
    items: [
      {
        quality: {
          id: 7,
          name: "Bluray-1080p",
          source: "bluray",
          resolution: 1080,
          modifier: "none",
        },
        allowed: true,
      },
    ],
    formatItems: [{ id: 11, format: 2, name: "x265", score: 0 }],
    language: { id: 1, name: "English" },
  },
]
