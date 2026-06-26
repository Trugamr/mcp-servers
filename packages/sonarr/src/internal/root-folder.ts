import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { del, getJson, provideTransport, sendJson } from "./http.js"
import { RootFolder } from "./schemas/root-folder.js"
import { v3Path } from "./version.js"

/** `GET /api/v3/rootfolder` — configured root folders and their free space. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(RootFolder), v3Path("/rootfolder")))

/** `POST /api/v3/rootfolder` — register a new root folder by path. */
export const add = (config: SonarrConfig, path: string) =>
  provideTransport(sendJson(config, "post", RootFolder, v3Path("/rootfolder"), { path }))

/** `DELETE /api/v3/rootfolder/{id}` — remove a root folder. */
export const remove = (config: SonarrConfig, id: number) =>
  provideTransport(del(config, v3Path(`/rootfolder/${id}`)))
