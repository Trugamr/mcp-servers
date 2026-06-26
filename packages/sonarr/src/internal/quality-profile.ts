import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { QualityProfile } from "./schemas/quality-profile.js"
import { v3Path } from "./version.js"

/** `GET /api/v3/qualityprofile` — all quality profiles. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(QualityProfile), v3Path("/qualityprofile")))
