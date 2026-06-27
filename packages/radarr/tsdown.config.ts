import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/effect.ts"],
  format: "esm",
  dts: true,
  target: "node24",
  clean: true,
  // `@trugamr/kit` is a source-only internal package — inline it (runtime + types) so the
  // published artifact has no dependency on it.
  noExternal: ["@trugamr/kit"],
})
