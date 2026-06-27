import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { QualityProfile } from "./schemas/quality-profile.js"

/** `GET /api/v3/qualityprofile` — all quality profiles. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(QualityProfile), "/api/v3/qualityprofile"))
