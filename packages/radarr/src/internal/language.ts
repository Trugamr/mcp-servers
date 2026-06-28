import { Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Language } from "./schemas/language.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/language`

/** `GET /api/v3/language` — every language Radarr knows. */
export const list = (config: RadarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Language), basePath))

/** `GET /api/v3/language/{id}` — a single language by its id. */
export const get = (config: RadarrConfig, id: number) =>
  provideTransport(getJson(config, Language, `${basePath}/${id}`))
