/**
 * `GET /api/v3/qualityprofile` payload. The lean `list_quality_profiles` keeps only
 * `id` + `name`; `get_quality_profile` returns the full shape below — a quality group
 * nesting its own items, `formatItems` scores, and a `language`.
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
        quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
        allowed: true,
      },
    ],
    formatItems: [{ id: 11, format: 2, name: "x265", score: 0 }],
    language: { id: 1, name: "English" },
  },
]
