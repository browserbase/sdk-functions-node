import { join } from "node:path";

import type { FunctionConfiguration } from "../types/definition.js";
import type { FunctionHandler } from "../types/handler.js";
import type { JSONSchemaInput } from "../types/schema.js";

import { writeManifestToDisk } from "./helpers.js";

// Singleton imports
import { environmentManager, functionsRegistry } from "../index.js";

/// TODO: Write good documentation here
export function defineFn<S extends JSONSchemaInput = unknown>(
  name: string,
  handler: FunctionHandler<S>,
  config: FunctionConfiguration<S> = {},
): void {
  functionsRegistry.register(name, handler, config);

  if (environmentManager.phase === "introspect") {
    const manifestsDir = join(
      process.cwd(),
      ".browserbase",
      "functions",
      "manifests",
    );

    const isFirstInvocation = functionsRegistry.size === 1;

    writeManifestToDisk(
      { name, handler, config },
      manifestsDir,
      isFirstInvocation,
    );
  }
}
