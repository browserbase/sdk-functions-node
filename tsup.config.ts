import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true, // emit .d.ts
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"], // dual package
  target: "es2020",
  minify: false, // true if you want smaller bundles
  splitting: false, // typical for libs
  treeshake: true,
});
