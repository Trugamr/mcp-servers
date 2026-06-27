import { createRadarrGlobalSetup, MOVIE_ROOT_FOLDER } from "@trugamr/testkit/radarr"

// Mount the suite's root-folder path as writable tmpfs so the movie seed doesn't
// need a real disk.
export default createRadarrGlobalSetup({
  tmpfs: { [MOVIE_ROOT_FOLDER]: "rw" },
})
