// The Sonarr release the integration suites pin to. Bump the image tag and the
// version string together — the `system.getStatus` assertions guard the pairing,
// and value assertions assume this version's fresh-install defaults.
export const SONARR_IMAGE = "lscr.io/linuxserver/sonarr:4.0.19.2979-ls316"
export const SONARR_VERSION = "4.0.19.2979"
