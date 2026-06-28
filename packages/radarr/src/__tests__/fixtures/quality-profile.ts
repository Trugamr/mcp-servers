/**
 * `GET /api/v3/qualityprofile` payload. Two profiles; the second resolves 1080p.
 * One item is a quality group (no `quality`, nested `items` the schema drops),
 * exercising the lean projection.
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
      { id: 1000, name: "WEB 1080p", allowed: true, items: [] },
    ],
  },
  {
    id: 4,
    name: "HD-1080p",
    upgradeAllowed: true,
    cutoff: 7,
    minFormatScore: 0,
    cutoffFormatScore: 0,
    items: [
      {
        quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
        allowed: true,
      },
    ],
  },
]
