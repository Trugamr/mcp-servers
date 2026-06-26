/**
 * Realistic `GET /api/v3/system/status` payload. `sqliteVersion` is not modeled
 * by the schema; including it here verifies that `Schema.Struct` drops unmodeled
 * keys instead of failing.
 */
export const systemStatusFixture = {
  appName: "Sonarr",
  instanceName: "Sonarr",
  version: "4.0.10.2544",
  buildTime: "2024-08-12T22:31:13Z",
  isDebug: false,
  isProduction: true,
  isAdmin: false,
  isUserInteractive: false,
  startupPath: "/app/sonarr/bin",
  appData: "/config",
  osName: "ubuntu",
  osVersion: "22.04",
  isNetCore: true,
  isLinux: true,
  isOsx: false,
  isWindows: false,
  isDocker: true,
  mode: "console",
  branch: "main",
  authentication: "forms",
  sqliteVersion: "3.40.1",
  migrationVersion: 208,
  urlBase: "",
  runtimeVersion: "6.0.32",
  runtimeName: "netCore",
  startTime: "2024-09-01T10:00:00Z",
  packageVersion: "4.0.10.2544",
  packageAuthor: "Team Sonarr",
  packageUpdateMechanism: "docker",
  databaseType: "sqLite",
  databaseVersion: "3.40.1",
}
