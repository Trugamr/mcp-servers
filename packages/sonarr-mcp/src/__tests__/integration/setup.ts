import { createSonarrGlobalSetup, SERIES_ROOT_FOLDER } from "@trugamr/testkit/sonarr"

// Mount the series root folder as writable tmpfs so the suite can seed a real
// series (for the list_series filter test) without a real disk.
export default createSonarrGlobalSetup({ tmpfs: { [SERIES_ROOT_FOLDER]: "rw" } })
