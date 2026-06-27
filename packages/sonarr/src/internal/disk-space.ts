import { Schema } from "effect"
import type { SonarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { DiskSpace } from "./schemas/disk-space.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/diskspace`

/** `GET /api/v3/diskspace` — free/total space for Sonarr-visible mounts. */
export const list = (config: SonarrConfig) =>
  provideTransport(getJson(config, Schema.Array(DiskSpace), basePath))
