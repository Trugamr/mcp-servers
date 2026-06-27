/**
 * Realistic `GET /api/v3/movie/{id}` payload (Lemony Snicket's A Series of
 * Unfortunate Events, tmdb 11774). `certification` is `null` to exercise
 * `optionalNullable` (Radarr sends nullable reference types as present-with-`null`).
 * `ratings` is not modeled; including it verifies `Schema.Struct` drops unmodeled
 * keys — including the nested `ratings` shape the SDK deliberately omits.
 */
export const movieFixture = {
  id: 1,
  title: "Lemony Snicket's A Series of Unfortunate Events",
  sortTitle: "lemony snickets series unfortunate events",
  status: "released",
  overview: "Orphaned siblings face their villainous distant relative, Count Olaf…",
  year: 2004,
  runtime: 108,
  hasFile: true,
  monitored: true,
  minimumAvailability: "released",
  isAvailable: true,
  qualityProfileId: 1,
  path: "/movies/Lemony Snicket's A Series of Unfortunate Events (2004)",
  titleSlug: "lemony-snickets-a-series-of-unfortunate-events-11774",
  studio: "Paramount Pictures",
  certification: null,
  genres: ["Adventure", "Comedy", "Family"],
  tags: [],
  added: "2024-01-01T00:00:00Z",
  tmdbId: 11774,
  imdbId: "tt0339291",
  sizeOnDisk: 0,
  ratings: { imdb: { votes: 100, value: 7.0 }, tmdb: { votes: 50, value: 6.9 } },
}
