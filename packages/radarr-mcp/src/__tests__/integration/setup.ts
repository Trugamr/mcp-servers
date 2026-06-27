import { createRadarrGlobalSetup, MOVIE_ROOT_FOLDER } from "@trugamr/testkit/radarr"

// Mount the movie root folder as writable tmpfs so the suite can seed a real movie
// (for the list_movies test) without a real disk.
export default createRadarrGlobalSetup({ tmpfs: { [MOVIE_ROOT_FOLDER]: "rw" } })
