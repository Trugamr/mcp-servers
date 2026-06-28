/** `GET /api/v3/qualityprofile` payload; the lean tool keeps only `id` + `name`. */
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
