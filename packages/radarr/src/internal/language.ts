import { Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Language } from "./schemas/language.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/language`

/** `GET /api/v3/language` — every language Radarr knows. */
export const list = (config: RadarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Language), basePath))
