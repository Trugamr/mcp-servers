import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/effect.ts"],
  format: "esm",
  dts: true,
  target: "node24",
  clean: true,
  // `@trugamr/kit` is a source-only internal package — bundle it into the output, both the
  // runtime (`alwaysBundle`) and the type declarations (`dts.alwaysBundle`), so the published
  // artifact carries no dependency on it.
  deps: {
    alwaysBundle: ["@trugamr/kit"],
    dts: { alwaysBundle: ["@trugamr/kit"] },
  },
})
