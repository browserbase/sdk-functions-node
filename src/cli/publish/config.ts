import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";

export interface PublishConfig {
  apiKey: string;
  projectId: string;
  apiUrl: string;
  entrypoint: string;
  workingDirectory: string;
}

export function loadConfig(options: {
  entrypoint?: string;
  apiUrl?: string;
}): PublishConfig {
  // Get API key from environment
  const apiKey = process.env["BROWSERBASE_API_KEY"];
  if (!apiKey) {
    console.error(
      chalk.red(
        "Error: BROWSERBASE_API_KEY not found in environment variables.",
      ),
    );
    console.log(
      chalk.gray(
        "Please set BROWSERBASE_API_KEY in your .env file or environment.",
      ),
    );
    process.exit(1);
  }

  // Get project ID from environment
  const projectId = process.env["BROWSERBASE_PROJECT_ID"];
  if (!projectId) {
    console.error(
      chalk.red(
        "Error: BROWSERBASE_PROJECT_ID not found in environment variables.",
      ),
    );
    console.log(
      chalk.gray(
        "Please set BROWSERBASE_PROJECT_ID in your .env file or environment.",
      ),
    );
    process.exit(1);
  }

  // Use provided API URL or default
  const apiUrl =
    options.apiUrl ||
    process.env["BROWSERBASE_API_BASE_URL"] ||
    "https://api.browserbase.com";

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
  // Additional validation if needed
  if (!config.apiKey.startsWith("bb_")) {
    console.warn(
      chalk.yellow(
        "Warning: API key doesn't start with 'bb_'. Make sure you're using a valid Browserbase API key.",
      ),
    );
  }
}
