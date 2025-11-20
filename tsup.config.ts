import { defineConfig } from "tsup";
import { readFileSync } from "fs";
import { join } from "path";

// Read package.json at build time
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf-8"),
);

export default defineConfig([
  // Main SDK build
  {
    entry: ["src/index.ts"],
    dts: true, // emit .d.ts
    sourcemap: true,
    clean: true,
    format: ["esm", "cjs"], // dual package
    target: "es2020",
    minify: false, // true if you want smaller bundles
    splitting: false, // typical for libs
    treeshake: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
  // CLI build
  {
    entry: {
      cli: "src/cli/main.ts",
    },
    outDir: "dist",
    dts: false, // CLI doesn't need .d.ts
    sourcemap: true,
    format: ["esm"],
    target: "es2020",
    minify: false,
    splitting: false,
    treeshake: true,
    define: {
      __CLI_VERSION__: JSON.stringify(packageJson.version),
    },
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    onSuccess: "cp -r src/cli/init/templates dist/",
  },
]);
