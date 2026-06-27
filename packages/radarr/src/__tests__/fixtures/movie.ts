/**
 * Realistic `GET /api/v3/movie/{id}` payload (The Shawshank Redemption, tmdb 278).
 * `certification` is `null` to exercise `optionalNullable` (Radarr sends nullable
 * reference types as present-with-`null`). `collection` and `ratings` are not
 * modeled; including them verifies `Schema.Struct` drops unmodeled keys — including
 * the nested `ratings` shape the SDK deliberately omits.
 */
export const movieFixture = {
  id: 1,
  title: "The Shawshank Redemption",
  sortTitle: "shawshank redemption",
  status: "released",
  overview: "Two imprisoned men bond over a number of years…",
  year: 1994,
  runtime: 142,
  hasFile: true,
  monitored: true,
  minimumAvailability: "released",
  isAvailable: true,
  qualityProfileId: 1,
  path: "/movies/The Shawshank Redemption (1994)",
  titleSlug: "the-shawshank-redemption-278",
  studio: "Castle Rock Entertainment",
  certification: null,
  genres: ["Drama", "Crime"],
  tags: [],
  added: "2024-01-01T00:00:00Z",
  tmdbId: 278,
  imdbId: "tt0111161",
  sizeOnDisk: 0,
  collection: { title: "The Shawshank Collection", tmdbId: 999 },
  ratings: { imdb: { votes: 100, value: 9.3 }, tmdb: { votes: 50, value: 8.7 } },
}
