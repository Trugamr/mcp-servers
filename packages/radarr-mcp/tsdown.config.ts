import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  // Executable, not a library: the bin runs the server. No type declarations needed.
  dts: false,
  target: "node24",
  clean: true,
})
