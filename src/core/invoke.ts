import { FunctionsCoreError } from "./errors.js";
import {
  functionsGet,
  functionsPost,
  pollUntil,
  resolveFunctionsApiConfig,
  type FunctionsApiConfig,
  type ResolveFunctionsApiConfigOptions,
} from "./shared.js";

export type InvocationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface InvocationResponse {
  id: string;
  functionId: string;
  status: InvocationStatus;
  params?: Record<string, unknown>;
  results?: unknown;
  sessionId?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  endedAt?: string;
  expiresAt?: string;
}

export interface InvokeFunctionOptions
  extends ResolveFunctionsApiConfigOptions {
  checkStatus?: string;
  functionId?: string;
  noWait?: boolean;
  params?: unknown;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
  onInvocationStatus?: (
    invocation: InvocationResponse,
    attempt: number,
  ) => void;
}

export async function invokeFunction(
  options: InvokeFunctionOptions,
): Promise<InvocationResponse> {
  const config = resolveFunctionsApiConfig(options);

  if (options.checkStatus) {
    return await getInvocationStatus(config, options.checkStatus);
  }
  if (!options.functionId) {
    throw new FunctionsCoreError(
      "functionId is required unless checkStatus is used.",
      { code: "missing_function_id" },
    );
  }

  const invocation = await functionsPost<InvocationResponse>(
    config,
    `/v1/functions/${options.functionId}/invoke`,
    { params: options.params ?? {} },
  );
  if (options.noWait) {
    return invocation;
  }

  const finalStatus = await pollUntil(
    () => getInvocationStatus(config, invocation.id),
    {
      done: (result) => !["PENDING", "RUNNING"].includes(result.status),
      intervalMs: options.pollIntervalMs ?? 1_000,
      maxAttempts: options.pollMaxAttempts ?? 900,
      ...(options.onInvocationStatus
        ? { onPoll: options.onInvocationStatus }
        : {}),
    },
  );

  if (finalStatus.status === "FAILED") {
    throw new FunctionsCoreError("Function invocation failed.", {
      code: "invocation_failed",
      responseBody: finalStatus,
    });
  }
  return finalStatus;
}

export async function getInvocationStatus(
  config: FunctionsApiConfig,
  invocationId: string,
): Promise<InvocationResponse> {
  return await functionsGet<InvocationResponse>(
    config,
    `/v1/functions/invocations/${invocationId}`,
  );
}
