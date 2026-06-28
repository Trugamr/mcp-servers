/**
 * `GET /api/v3/movie/lookup?term=` results. The first candidate isn't in the library,
 * so Radarr omits `id` (a missing id is the "not added yet" signal); the second is
 * already in the library, carrying its library `id`. `images`/`ratings` are unmodeled,
 * verifying `Schema.Struct` drops the keys the lean `MovieLookup` omits.
 */
export const movieLookupFixture = [
  {
    tmdbId: 550,
    imdbId: "tt0137523",
    title: "Fight Club",
    titleSlug: "fight-club-550",
    year: 1999,
    overview: "An insomniac office worker and a soap maker form an underground fight club…",
    studio: "Fox 2000 Pictures",
    status: "released",
    runtime: 139,
    genres: ["Drama"],
    monitored: false,
    images: [{ coverType: "poster", url: "/MEDIA/poster.jpg" }],
    ratings: { tmdb: { votes: 1000, value: 8.4 } },
  },
  {
    id: 77,
    tmdbId: 1700,
    title: "Once Upon a Time in the Library",
    titleSlug: "once-upon-a-time-in-the-library-1700",
    year: 2014,
    monitored: true,
    hasFile: false,
  },
]

/** The single resource from `GET /api/v3/movie/lookup/tmdb?tmdbId=` that an add re-posts. */
export const movieLookupTmdbFixture = {
  tmdbId: 550,
  imdbId: "tt0137523",
  title: "Fight Club",
  titleSlug: "fight-club-550",
  year: 1999,
  status: "released",
  images: [{ coverType: "poster", url: "/MEDIA/poster.jpg" }],
}
