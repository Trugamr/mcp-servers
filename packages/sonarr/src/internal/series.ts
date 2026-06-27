import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Series } from "./schemas/series.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/series`

/** `GET /api/v3/series` — every series in the library. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Series), basePath))

/** `GET /api/v3/series/{id}` — a single series by its Sonarr id. */
export const get = (config: SonarrConfig, id: number) =>
  provideTransport(getJson(config, Series, `${basePath}/${id}`))
