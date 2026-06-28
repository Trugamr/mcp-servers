/**
 * `GET /api/v3/movie/lookup?term=` results. The first candidate isn't in the library,
 * so Radarr omits `id`; the second is already in the library, carrying its `id`. The
 * heavy `images`/`ratings` keys verify the lean lookup summary drops them.
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

/** The single resource `GET /api/v3/movie/lookup/tmdb?tmdbId=` returns for an add. */
export const movieLookupTmdbFixture = {
  tmdbId: 550,
  imdbId: "tt0137523",
  title: "Fight Club",
  titleSlug: "fight-club-550",
  year: 1999,
  status: "released",
  images: [{ coverType: "poster", url: "/MEDIA/poster.jpg" }],
}
