/**
 * Realistic `GET /api/v3/series/{id}` payload. `cleanTitle` is unmodeled (verifies
 * `Schema.Struct` drops unknown keys) and `network` is `null` (verifies
 * `optionalNullable` accepts an explicit null rather than failing to decode).
 */
export const seriesFixture = {
  id: 5,
  title: "The Expanse",
  sortTitle: "expanse",
  status: "ended",
  ended: true,
  overview: "A thriller set two hundred years in the future.",
  network: null,
  airTime: "20:00",
  year: 2015,
  path: "/tv/The Expanse",
  qualityProfileId: 1,
  seasonFolder: true,
  monitored: true,
  runtime: 60,
  tvdbId: 280619,
  imdbId: "tt3230854",
  titleSlug: "the-expanse",
  seriesType: "standard",
  cleanTitle: "theexpanse",
  genres: ["Drama", "Science Fiction"],
  tags: [],
  added: "2021-01-01T00:00:00Z",
  firstAired: "2015-12-14T00:00:00Z",
  lastAired: "2022-01-14T00:00:00Z",
  ratings: { votes: 1000, value: 8.5 },
  statistics: {
    seasonCount: 6,
    episodeFileCount: 62,
    episodeCount: 62,
    totalEpisodeCount: 62,
    sizeOnDisk: 123456789,
    percentOfEpisodes: 100,
  },
  seasons: [
    {
      seasonNumber: 1,
      monitored: true,
      statistics: {
        episodeFileCount: 10,
        episodeCount: 10,
        totalEpisodeCount: 10,
        sizeOnDisk: 12345678,
        percentOfEpisodes: 100,
        nextAiring: null,
        previousAiring: "2015-12-14T00:00:00Z",
      },
    },
  ],
}
