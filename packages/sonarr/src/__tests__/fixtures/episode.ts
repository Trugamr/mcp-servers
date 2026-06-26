/**
 * Realistic `GET /api/v3/episode` element. `sceneEpisodeNumber` is unmodeled
 * (verifies key-stripping) and `overview` is `null` (verifies `optionalNullable`).
 */
export const episodeFixture = {
  id: 101,
  seriesId: 5,
  tvdbId: 5012345,
  episodeFileId: 0,
  seasonNumber: 2,
  episodeNumber: 3,
  title: "Static",
  airDate: "2017-02-15",
  airDateUtc: "2017-02-16T02:00:00Z",
  overview: null,
  runtime: 43,
  hasFile: false,
  monitored: true,
  absoluteEpisodeNumber: 13,
  sceneEpisodeNumber: 0,
}
