import { defineConfig } from "vitest/config"

// Integration suite: drives the SDK against a real Radarr instance booted by the
// global setup (or one supplied via RADARR_BASE_URL / RADARR_API_KEY). Kept in its
// own config so the default `vitest run` stays mock-only and Docker-free.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./src/__tests__/integration/setup.ts"],
    // Real HTTP round-trips and one-time container boot need headroom.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
