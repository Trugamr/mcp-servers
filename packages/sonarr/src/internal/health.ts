import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Health } from "./schemas/health.js"
import { v3Path } from "./version.js"

/** `GET /api/v3/health` — active health-check messages. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Health), v3Path("/health")))
