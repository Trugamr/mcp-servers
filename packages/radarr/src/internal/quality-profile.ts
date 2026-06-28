import { Effect, Schema } from "effect"
import type { RadarrConfig } from "./config.js"
import { del, getJson, provideTransport, sendJson } from "./http.js"
import {
  QualityProfile,
  type QualityProfileInput,
  type QualityProfilePatch,
} from "./schemas/quality-profile.js"
import { apiBase } from "./version.js"

const basePath = `${apiBase}/qualityprofile`

/** The current resource fetched before a merge-and-PUT, kept verbatim so no field is lost. */
const Passthrough = Schema.Record({ key: Schema.String, value: Schema.Unknown })

/** `GET /api/v3/qualityprofile` — all quality profiles. */
export const list = (config: RadarrConfig) =>
  provideTransport(getJson(config, Schema.Array(QualityProfile), basePath))

/** `GET /api/v3/qualityprofile/{id}` — a single quality profile. */
export const get = (config: RadarrConfig, id: number) =>
  provideTransport(getJson(config, QualityProfile, `${basePath}/${id}`))

/** `POST /api/v3/qualityprofile` — create a profile from a full body. Returns the created profile. */
export const create = (config: RadarrConfig, body: QualityProfileInput) =>
  provideTransport(sendJson(config, "post", QualityProfile, basePath, body))

/**
 * `PUT /api/v3/qualityprofile/{id}` — update a profile. Fetches the current resource
 * permissively and overlays `patch` so unmodeled and unspecified fields survive (a lean
 * decode would drop them), then PUTs the merged body. Returns the updated profile.
 */
export const update = (config: RadarrConfig, id: number, patch: QualityProfilePatch) =>
  provideTransport(
    getJson(config, Passthrough, `${basePath}/${id}`).pipe(
      Effect.flatMap((current) =>
        sendJson(config, "put", QualityProfile, `${basePath}/${id}`, { ...current, ...patch, id }),
      ),
    ),
  )

/** `DELETE /api/v3/qualityprofile/{id}` — delete a quality profile. */
export const remove = (config: RadarrConfig, id: number) =>
  provideTransport(del(config, `${basePath}/${id}`))
