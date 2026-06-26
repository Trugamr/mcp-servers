import { Schema } from "effect"

/**
 * Subset of `GET /api/v3/system/status`. `Schema.Struct` strips unknown keys,
 * so this stays forward-compatible as Sonarr adds fields. Hand-written for now;
 * full schemas will be derived from each instance's `openapi.json` later.
 */
export const SystemStatus = Schema.Struct({
  appName: Schema.String,
  instanceName: Schema.String,
  version: Schema.String,
  buildTime: Schema.String,
  branch: Schema.String,
  runtimeName: Schema.String,
  runtimeVersion: Schema.String,
  osName: Schema.String,
  isDocker: Schema.Boolean,
  authentication: Schema.String,
  urlBase: Schema.String,
  databaseType: Schema.String,
  databaseVersion: Schema.String,
})

export type SystemStatus = Schema.Schema.Type<typeof SystemStatus>
