import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The integration suite has its own config + Docker-backed global setup.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
})
