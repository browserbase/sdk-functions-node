import chalk from "chalk";
import "dotenv/config";

/**
 * Base configuration required for all Browserbase API calls.
 */
export interface BaseConfig {
  apiKey: string;
  apiUrl: string;
}

const DEFAULT_API_URL = "https://api.browserbase.com";

/**
 * Get the Browserbase API key from environment.
 * Exits the process with an error message if not found.
 */
export function requireApiKey(): string {
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
  return apiKey;
}

/**
 * Get the Browserbase project ID from environment.
 * Exits the process with an error message if not found.
 */
export function requireProjectId(): string {
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
  return projectId;
}

/**
 * Get the API URL from options, environment, or use the default.
 */
export function getApiUrl(override?: string): string {
  return override || process.env["BROWSERBASE_API_BASE_URL"] || DEFAULT_API_URL;
}

/**
 * Warn if API key doesn't match expected format.
 */
export function validateApiKeyFormat(apiKey: string): void {
  if (!apiKey.startsWith("bb_")) {
    console.warn(
      chalk.yellow(
        "Warning: API key doesn't start with 'bb_'. Make sure you're using a valid Browserbase API key.",
      ),
    );
  }
}

/**
 * Load base configuration (API key and URL).
 * Use this for commands that don't need project-specific config.
 */
export function loadBaseConfig(options?: { apiUrl?: string }): BaseConfig {
  return {
    apiKey: requireApiKey(),
    apiUrl: getApiUrl(options?.apiUrl),
  };
}
