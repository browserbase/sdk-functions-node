const DEFAULT_API_URL = "https://api.browserbase.com";

export interface DeleteFunctionOptions {
  apiKey?: string;
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  functionId: string;
  onResponse?: (response: Response) => void;
}

export interface DeleteFunctionResponse {
  /** Whether this request transitioned an active function to deleted. */
  deleted: boolean;
}

/**
 * Soft-delete a deployed Browserbase Function.
 *
 * The operation is idempotent. A missing, already-deleted, or inaccessible
 * function returns `{ deleted: false }`.
 */
export async function deleteFunction(
  options: DeleteFunctionOptions,
): Promise<DeleteFunctionResponse> {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? env["BROWSERBASE_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "Missing Browserbase API key. Set BROWSERBASE_API_KEY or pass apiKey.",
    );
  }

  const baseUrl =
    options.baseUrl ??
    env["BROWSERBASE_BASE_URL"] ??
    env["BROWSERBASE_API_BASE_URL"] ??
    DEFAULT_API_URL;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const response = await fetchImplementation(
    new URL(`/v1/functions/${encodeURIComponent(options.functionId)}`, baseUrl),
    {
      method: "DELETE",
      headers: { "x-bb-api-key": apiKey },
    },
  );

  options.onResponse?.(response);
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      responseBody ||
        `Function deletion failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as DeleteFunctionResponse;
}
