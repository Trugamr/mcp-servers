import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { SystemStatus } from "./schemas/system-status.js"
import { v3Path } from "./version.js"

/** `GET /api/v3/system/status` — version, runtime, database, and auth info. */
export const getStatus = (config: SonarrConfig) =>
  provideTransport(getJson(config, SystemStatus, v3Path("/system/status")))
