import { Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { RootFolder } from "./schemas/root-folder.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/rootfolder`

/** `GET /api/v3/rootfolder` — configured root folders and their free space. */
export const list = (config: RadarrConfig) =>
  provideTransport(getJson(config, Schema.Array(RootFolder), basePath))
