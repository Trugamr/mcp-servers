import { createSonarrGlobalSetup } from "@trugamr/testkit/sonarr"

// The MCP suite drives the server against a fresh instance — no seeded data or
// writable root folders needed, so no tmpfs.
export default createSonarrGlobalSetup()
