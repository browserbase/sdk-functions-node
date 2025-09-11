import type { FunctionRegistry } from "../runtime/registry.js";
import {
  GetNextInvocationError,
  PostErrorError,
  PostResultError,
} from "../utils/errors.js";
import {
  RuntimeError,
  RuntimeEvent,
  RuntimeEventPayload,
} from "../schemas/events.js";
import type { FunctionManifest } from "../types/definition.js";
import type { FunctionHandlerCallbackReturnValue } from "../types/handler.js";

export interface IRuntimeClient {
  waitForNextInvocation(): Promise<RuntimeEvent>;
  getFunctionDefinitionByName(name: string): FunctionManifest<unknown> | null;

  executeFunction(
    event: RuntimeEventPayload,
  ): Promise<FunctionHandlerCallbackReturnValue>;

  handleSuccess(
    requestId: string,
    result: FunctionHandlerCallbackReturnValue,
  ): Promise<void>;

  handleFailure(requestId: string, error: unknown): Promise<void>;
}

export class RuntimeClient implements IRuntimeClient {
  private runtimeApi: string;
  private baseUrl: string;
  private registry: FunctionRegistry;

  constructor(registry: FunctionRegistry, runtimeApi: string) {
    this.runtimeApi = runtimeApi;
    this.baseUrl = `http://${this.runtimeApi}/2018-06-01/runtime`;
    this.registry = registry;
  }

  public async waitForNextInvocation(): Promise<RuntimeEvent> {
    const response = await fetch(`${this.baseUrl}/invocation/next`);
    if (!response.ok) {
      throw new GetNextInvocationError(
        `Next invocation failed: ${response.status} ${response.statusText}`,
      );
    }

    const requestId =
      response.headers.get("Lambda-Runtime-Aws-Request-Id") || "unknown";
    const traceId = response.headers.get("Lambda-Runtime-Trace-Id");

    // This is to allow the X-Ray SDK to trace across invocations
    if (traceId) {
      process.env["_X_AMZN_TRACE_ID"] = traceId;
    }

    const text = await response.text();
    const parsedData = JSON.parse(text);

    const safeParseResult = RuntimeEventPayload.safeParse(parsedData);
    if (!safeParseResult.success) {
      // TODO: type error
      throw new Error("Failed to parse event into runtime event");
    }

    const event = safeParseResult.data;
    return { requestId, event };
  }

  public getFunctionDefinitionByName(
    name: string,
  ): FunctionManifest<unknown> | null {
    return this.registry.getByName(name);
  }

  public executeFunction(
    event: RuntimeEventPayload,
  ): Promise<FunctionHandlerCallbackReturnValue> {
    return this.registry.execute(
      event.functionName,
      event.params ?? {},
      event.context,
    );
  }

  public async handleSuccess(
    requestId: string,
    payload: RuntimeEventPayload,
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/invocation/${encodeURIComponent(requestId)}/response`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new PostResultError(
        `Failed to post response: ${response.status} ${response.statusText}`,
      );
    }
  }

  public async handleFailure(requestId: string, error: unknown): Promise<void> {
    const runtimeError = formatRuntimeError(error);

    const response = await fetch(
      `${this.baseUrl}/invocation/${encodeURIComponent(requestId)}/error`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runtimeError),
      },
    );

    if (!response.ok) {
      throw new PostErrorError(
        `Failed to post error: ${response.status} ${response.statusText}`,
      );
    }
  }
}

function formatRuntimeError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorType: error.name,
      stackTrace: error.stack?.split("/n") ?? [],
    };
  }

  let message = "An unknown error occurred";
  let type = "UnknownError";
  let stack = [] as string[];

  if (typeof error === "string") {
    return {
      errorMessage: error,
      errorType: type,
      stackTrace: stack,
    };
  }

  if (typeof error !== "object" || error === null) {
    return {
      errorMessage: String(error),
      errorType: type,
      stackTrace: stack,
    };
  }

  if ("message" in error && typeof error.message === "string") {
    message = error.message;
  }

  if ("name" in error && typeof error.name === "string") {
    type = error.name;
  }

  if (
    "stack" in error &&
    Array.isArray(error.stack) &&
    typeof error.stack[0] === "string"
  ) {
    stack = error.stack;
  }

  return {
    errorMessage: message,
    errorType: type,
    stackTrace: stack,
  };
}
