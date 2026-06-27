import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { del, getJson, provideTransport, sendJson } from "./http.js"
import { Tag } from "./schemas/tag.js"

/** `GET /api/v3/tag` — all tags. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(Tag), "/api/v3/tag"))

/** `POST /api/v3/tag` — create a tag with the given label. */
export const create = (config: SonarrConfig, label: string) =>
  provideTransport(sendJson(config, "post", Tag, "/api/v3/tag", { label }))

/** `DELETE /api/v3/tag/{id}` — delete a tag. */
export const remove = (config: SonarrConfig, id: number) =>
  provideTransport(del(config, `/api/v3/tag/${id}`))
