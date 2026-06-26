import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Series } from "./schemas/series.js"
import { v3Path } from "./version.js"

/** `GET /api/v3/series` — every series in the library. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Series), v3Path("/series")))

/** `GET /api/v3/series/{id}` — a single series by its Sonarr id. */
export const get = (config: SonarrConfig, id: number) =>
  provideTransport(getJson(config, Series, v3Path(`/series/${id}`)))
