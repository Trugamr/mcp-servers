import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/effect.ts"],
  format: "esm",
  dts: true,
  target: "node24",
  clean: true,
})
