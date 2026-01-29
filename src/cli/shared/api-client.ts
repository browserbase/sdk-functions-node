import chalk from "chalk";

import { type BaseConfig } from "./config.js";

/**
 * Parse error response from the API, handling both JSON and text responses.
 */
export async function parseErrorResponse(response: Response): Promise<string> {
  let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

  try {
    const errorBody = await response.json();
    if (
      typeof errorBody === "object" &&
      errorBody !== null &&
      ("message" in errorBody || "error" in errorBody)
    ) {
      const typedErrorBody = errorBody as { message?: string; error?: string };
      errorMessage =
        typedErrorBody.message || typedErrorBody.error || errorMessage;
    }
  } catch {
    try {
      const textBody = await response.text();
      if (textBody) {
        errorMessage = textBody;
      }
    } catch {
      // Keep default error message
    }
  }

  return errorMessage;
}

/**
 * Handle fetch errors with helpful messages for common issues.
 */
function handleFetchError(error: unknown, apiUrl: string): string {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error occurred";

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ECONNREFUSED"
  ) {
    console.log(
      chalk.yellow(
        `\nCannot connect to ${apiUrl}. Make sure the API server is reachable.`,
      ),
    );
  }

  return errorMessage;
}

/**
 * Make an authenticated GET request to the Browserbase API.
 */
export async function apiGet<T>(
  config: BaseConfig,
  endpoint: string,
): Promise<T | null> {
  try {
    const url = `${config.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-bb-api-key": config.apiKey,
      },
    });

    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      console.error(chalk.red(`API error: ${errorMessage}`));
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    handleFetchError(error, config.apiUrl);
    return null;
  }
}

/**
 * Make an authenticated POST request to the Browserbase API.
 */
export async function apiPost<T>(
  config: BaseConfig,
  endpoint: string,
  body: unknown,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const url = `${config.apiUrl}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bb-api-key": config.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (error) {
    const errorMessage = handleFetchError(error, config.apiUrl);
    return { success: false, error: errorMessage };
  }
}

export interface PollOptions {
  /** Polling interval in milliseconds */
  intervalMs?: number;
  /** Maximum number of polling attempts */
  maxAttempts?: number;
  /** Message to display while polling */
  waitingMessage?: string;
  /** Message to display when max attempts reached */
  timeoutMessage?: string;
}

/**
 * Poll a status endpoint until a terminal condition is reached.
 */
export async function pollUntil<T>(
  fetchStatus: () => Promise<T | null>,
  isTerminal: (status: T) => boolean,
  getDisplayStatus: (status: T) => string,
  options?: PollOptions,
): Promise<T | null> {
  const intervalMs = options?.intervalMs ?? 1000;
  const maxAttempts = options?.maxAttempts ?? 900;
  const waitingMessage = options?.waitingMessage ?? "Waiting for completion...";
  const timeoutMessage =
    options?.timeoutMessage ?? "Still running after maximum wait time.";

  console.log(chalk.cyan(`\n${waitingMessage}`));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await fetchStatus();

    if (!status) {
      console.error(chalk.red("Failed to get status"));
      return null;
    }

    process.stdout.write(
      `\r${chalk.gray(`Status: ${getDisplayStatus(status)}... (${attempt + 1}/${maxAttempts})`)}`,
    );

    if (isTerminal(status)) {
      process.stdout.write("\r" + " ".repeat(70) + "\r");
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  process.stdout.write("\r" + " ".repeat(70) + "\r");
  console.error(chalk.yellow(timeoutMessage));
  return null;
}
