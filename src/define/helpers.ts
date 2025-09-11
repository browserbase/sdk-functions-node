import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import z from "zod";

import type {
  FunctionManifest,
  PersistedFunctionManifest,
} from "../types/definition.js";
import type { JSONSchemaInput } from "../types/schema.js";

export function writeManifestToDisk<S extends JSONSchemaInput>(
  manifest: FunctionManifest<S>,
  manifestsDir: string,
  isFirstInvocation: boolean,
) {
  if (isFirstInvocation) {
    // Clear manifests directory if it exists to remove stale menifests
    if (existsSync(manifestsDir)) {
      rmSync(manifestsDir, { recursive: true });
    }

    mkdirSync(manifestsDir, { recursive: true });
  }

  const persistedManifest = buildPersistedFunctionManifest(manifest);

  writeFileSync(
    join(manifestsDir, `${manifest.name}.json`),
    JSON.stringify(persistedManifest, null, 2),
  );
}

export function buildPersistedFunctionManifest<S extends JSONSchemaInput>(
  manifest: FunctionManifest<S>,
): PersistedFunctionManifest<S> {
  const { name, config } = manifest;
  const { parametersSchema, ...configWithoutSchema } = config;

  const processedConfig: PersistedFunctionManifest<S>["config"] = {
    ...configWithoutSchema,
  };

  if (parametersSchema) {
    processedConfig.parametersSchema =
      buildPersistedJsonSchema(parametersSchema);
  }

  const processedManifest: PersistedFunctionManifest<S> = {
    name,
    config: processedConfig,
  };

  return processedManifest;
}

export function buildPersistedJsonSchema(input: JSONSchemaInput): object {
  if (input instanceof z.ZodObject) {
    return z.toJSONSchema(input);
  }

  return {};
}
