/**
 * Realistic `GET /api/v3/system/status` payload. `sqliteVersion` is not modeled
 * by the schema; including it here verifies that `Schema.Struct` drops unmodeled
 * keys instead of failing.
 */
export const systemStatusFixture = {
  appName: "Radarr",
  instanceName: "Radarr",
  version: "5.14.0.9383",
  buildTime: "2024-09-01T20:31:13Z",
  isDebug: false,
  isProduction: true,
  isAdmin: false,
  isUserInteractive: false,
  startupPath: "/app/radarr/bin",
  appData: "/config",
  osName: "ubuntu",
  osVersion: "22.04",
  isNetCore: true,
  isLinux: true,
  isOsx: false,
  isWindows: false,
  isDocker: true,
  mode: "console",
  branch: "master",
  authentication: "forms",
  sqliteVersion: "3.40.1",
  migrationVersion: 261,
  urlBase: "",
  runtimeVersion: "6.0.32",
  runtimeName: "netCore",
  startTime: "2024-09-01T10:00:00Z",
  packageVersion: "5.14.0.9383",
  packageAuthor: "Team Radarr",
  packageUpdateMechanism: "docker",
  databaseType: "sqLite",
  databaseVersion: "3.40.1",
}
