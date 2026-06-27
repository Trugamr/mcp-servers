import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests share the `*.test.ts` suffix but hit a real Sonarr; they
    // run only via `vitest.integration.config.ts`, never in the mocked suite.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
})
