import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { SystemStatus } from "./schemas/system-status.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/system`

/** `GET /api/v3/system/status` — version, runtime, database, and auth info. */
export const getStatus = (config: RadarrConfig) =>
  provideTransport(getJson(config, SystemStatus, `${basePath}/status`))
