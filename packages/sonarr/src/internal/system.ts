import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { SystemStatus } from "./schemas/system-status.js"

/** `GET /api/v3/system/status` — version, runtime, database, and auth info. */
export const getStatus = (config: SonarrConfig) =>
  provideTransport(getJson(config, SystemStatus, "/api/v3/system/status"))
