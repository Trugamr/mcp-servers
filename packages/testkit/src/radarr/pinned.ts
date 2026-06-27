// The Radarr release the integration suites pin to. Bump the image tag and the
// version string together — the `system.getStatus` assertions guard the pairing,
// and value assertions assume this version's fresh-install defaults.
export const RADARR_IMAGE = "lscr.io/linuxserver/radarr:6.2.1.10461-ls307"
export const RADARR_VERSION = "6.2.1.10461"
