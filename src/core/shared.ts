import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { FunctionsCoreError } from "./errors.js";

export const DEFAULT_FUNCTIONS_API_URL = "https://api.browserbase.com";

export interface FunctionsApiConfig {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  onResponse?: (response: Response) => void;
}

export interface ResolveFunctionsApiConfigOptions {
  apiKey?: string;
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  onResponse?: (response: Response) => void;
}

export interface PollOptions<T> {
  done: (value: T) => boolean;
  intervalMs?: number;
  maxAttempts?: number;
  onPoll?: (value: T, attempt: number) => void;
}

export function resolveFunctionsApiConfig(
  options: ResolveFunctionsApiConfigOptions = {},
): FunctionsApiConfig {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? env["BROWSERBASE_API_KEY"];
  if (!apiKey) {
    throw new FunctionsCoreError(
      "Missing Browserbase API key. Set BROWSERBASE_API_KEY or pass apiKey.",
      { code: "missing_api_key" },
    );
  }

  const config: FunctionsApiConfig = {
    apiKey,
    baseUrl:
      options.baseUrl ??
      env["BROWSERBASE_BASE_URL"] ??
      env["BROWSERBASE_API_BASE_URL"] ??
      DEFAULT_FUNCTIONS_API_URL,
  };
  if (options.fetch !== undefined) {
    config.fetch = options.fetch;
  }
  if (options.onResponse !== undefined) {
    config.onResponse = options.onResponse;
  }
  return config;
}

export async function functionsRequest(
  config: FunctionsApiConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const fetchImplementation = config.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImplementation(new URL(path, config.baseUrl), {
      ...init,
      headers: {
        "x-bb-api-key": config.apiKey,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new FunctionsCoreError(formatErrorMessage(error), {
      cause: error,
      code: "request_failed",
    });
  }

  config.onResponse?.(response);
  if (!response.ok) {
    const responseBody = await readErrorBody(response);
    throw new FunctionsCoreError(formatResponseError(response, responseBody), {
      code: "http_error",
      httpStatus: response.status,
      responseBody,
    });
  }
  return response;
}

export async function functionsGet<T>(
  config: FunctionsApiConfig,
  path: string,
): Promise<T> {
  const response = await functionsRequest(config, path);
  return (await response.json()) as T;
}

export async function functionsPost<T>(
  config: FunctionsApiConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await functionsRequest(config, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export async function pollUntil<T>(
  loader: () => Promise<T>,
  options: PollOptions<T>,
): Promise<T> {
  const intervalMs = options.intervalMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 120;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const value = await loader();
    options.onPoll?.(value, attempt);
    if (options.done(value)) {
      return value;
    }
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, intervalMs),
    );
  }

  throw new FunctionsCoreError(
    "Timed out while waiting for the Browserbase Functions operation to complete.",
    { code: "timeout" },
  );
}

export async function resolveEntrypoint(
  entrypoint: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const absolutePath = resolve(cwd, entrypoint);
  let entrypointStat;
  try {
    entrypointStat = await stat(absolutePath);
  } catch {
    throw new FunctionsCoreError(`Entrypoint file not found: ${absolutePath}`, {
      code: "invalid_entrypoint",
    });
  }

  if (!entrypointStat.isFile()) {
    throw new FunctionsCoreError(`Entrypoint must be a file: ${absolutePath}`, {
      code: "invalid_entrypoint",
    });
  }

  const extension = extname(absolutePath).toLowerCase();
  if (
    ![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"].includes(extension)
  ) {
    throw new FunctionsCoreError(
      `Unsupported entrypoint extension: ${extension}`,
      {
        code: "invalid_entrypoint",
      },
    );
  }

  return absolutePath;
}

export function parseJsonArgument(
  rawValue: string | undefined,
  label: string,
): unknown {
  if (!rawValue) {
    return {};
  }
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new FunctionsCoreError(
      `Invalid JSON for ${label}: ${formatErrorMessage(error)}`,
      { cause: error, code: "invalid_json" },
    );
  }
}

export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function formatResponseError(response: Response, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as { error?: unknown; message?: unknown };
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
  }
  if (typeof body === "string") {
    return body;
  }
  return `HTTP ${response.status}: ${response.statusText}`;
}
