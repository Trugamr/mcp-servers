import { Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { Movie } from "./schemas/movie.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/movie`

/** `GET /api/v3/movie` — every movie in the library. */
export const list = (config: RadarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Movie), basePath))

/** `GET /api/v3/movie/{id}` — a single movie by its Radarr id. */
export const get = (config: RadarrConfig, id: number) =>
  provideTransport(getJson(config, Movie, `${basePath}/${id}`))
