import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  type BaseConfig,
  requireApiKey,
  requireProjectId,
  getApiUrl,
  validateApiKeyFormat,
} from "../shared/index.js";

/**
 * Extended configuration for publish command.
 */
export interface PublishConfig extends BaseConfig {
  projectId: string;
  entrypoint: string;
  workingDirectory: string;
}

export function loadConfig(options: {
  entrypoint?: string;
  apiUrl?: string;
}): PublishConfig {
  const apiKey = requireApiKey();
  const projectId = requireProjectId();
  const apiUrl = getApiUrl(options.apiUrl);

  // Use provided entrypoint or default to main.ts
  const entrypoint = options.entrypoint || "main.ts";

  // Validate entrypoint exists
  const entrypointPath = path.resolve(entrypoint);
  if (!fs.existsSync(entrypointPath)) {
    console.error(
      chalk.red(`Error: Entrypoint file not found: ${entrypointPath}`),
    );
    process.exit(1);
  }

  // Validate entrypoint has valid extension
  const ext = path.extname(entrypoint).toLowerCase();
  if (![".ts", ".js", ".mjs", ".mts"].includes(ext)) {
    console.error(
      chalk.red(
        `Error: Invalid entrypoint extension: ${ext}. Must be .ts, .js, .mjs, or .mts`,
      ),
    );
    process.exit(1);
  }

  return {
    apiKey,
    projectId,
    apiUrl,
    entrypoint,
    workingDirectory: process.cwd(),
  };
}

export function validateConfig(config: PublishConfig): void {
  validateApiKeyFormat(config.apiKey);
}
