import type { RadarrConfig } from "./config.js"
import { getJson, provideTransport } from "./http.js"
import { QueuePage } from "./schemas/queue.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/queue`

/** `GET /api/v3/queue` — downloads in flight on the client (page one; paging deferred). */
export const list = (config: RadarrConfig) => provideTransport(getJson(config, QueuePage, basePath))
