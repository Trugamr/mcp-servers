import {
  createSonarrGlobalSetup,
  SERIES_ROOT_FOLDER,
  SPARE_ROOT_FOLDER,
} from "@trugamr/testkit/sonarr"

// Mount the suite's root-folder paths as writable tmpfs so the seed and
// root-folder tests don't need a real disk.
export default createSonarrGlobalSetup({
  tmpfs: { [SERIES_ROOT_FOLDER]: "rw", [SPARE_ROOT_FOLDER]: "rw" },
})
