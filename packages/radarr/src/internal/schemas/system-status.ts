import { Schema } from "effect"

/**
 * `GET /api/v3/system/status`. `Schema.Struct` strips unknown keys, so unmodeled
 * fields (e.g. `sqliteVersion`) are dropped rather than failing, keeping the SDK
 * forward-compatible as Radarr's payload grows. Hand-written; full schemas can be
 * derived from each instance's `openapi.json`.
 *
 * The `package*` fields are supplied by the packager (e.g. linuxserver.io) and
 * may be absent on other installs, so they are optional.
 */
export const SystemStatus = Schema.Struct({
  appName: Schema.String,
  instanceName: Schema.String,
  version: Schema.String,
  buildTime: Schema.String,
  isDebug: Schema.Boolean,
  isProduction: Schema.Boolean,
  isAdmin: Schema.Boolean,
  isUserInteractive: Schema.Boolean,
  startupPath: Schema.String,
  appData: Schema.String,
  osName: Schema.String,
  osVersion: Schema.String,
  isNetCore: Schema.Boolean,
  isLinux: Schema.Boolean,
  isOsx: Schema.Boolean,
  isWindows: Schema.Boolean,
  isDocker: Schema.Boolean,
  mode: Schema.String,
  branch: Schema.String,
  authentication: Schema.String,
  migrationVersion: Schema.Number,
  urlBase: Schema.String,
  runtimeVersion: Schema.String,
  runtimeName: Schema.String,
  startTime: Schema.String,
  packageVersion: Schema.optional(Schema.String),
  packageAuthor: Schema.optional(Schema.String),
  packageUpdateMechanism: Schema.optional(Schema.String),
  databaseType: Schema.String,
  databaseVersion: Schema.String,
})

export type SystemStatus = Schema.Schema.Type<typeof SystemStatus>
