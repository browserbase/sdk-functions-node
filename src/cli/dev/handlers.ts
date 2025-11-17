import { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import chalk from "chalk";
import { InvocationBridge, type RuntimeError } from "./bridge.js";

/**
 * Parse the JSON body from an incoming request.
 */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (error: unknown) {
        reject(new Error("Invalid JSON body", { cause: error }));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Handle GET /2018-06-01/runtime/invocation/next
 * This endpoint is called by the runtime to get the next invocation.
 * We hold the connection until an invocation arrives.
 */
export async function handleInvocationNext(
  _req: IncomingMessage,
  res: ServerResponse,
  bridge: InvocationBridge,
): Promise<void> {
  // Hold the connection in the bridge
  bridge.holdNextConnection(res);

  // The response will be completed later when an invocation arrives
  // via triggerInvocation in the bridge
}

/**
 * Handle POST /v1/functions/:name/invoke
 * This endpoint is called by external clients to invoke a function.
 */
export async function handleFunctionInvoke(
  req: IncomingMessage,
  res: ServerResponse,
  functionName: string,
  bridge: InvocationBridge,
): Promise<void> {
  try {
    // Parse and validate the request body
    const body = await parseJsonBody(req);

    // Define the expected schema based on README
    const invokeSchema = z.object({
      functionName: z.string().optional(), // Optional, we get it from URL
      params: z.unknown().default({}), // Default to empty object
      context: z
        .object({
          invocation: z.object({
            id: z.string(),
            region: z.string(),
          }),
          session: z.object({
            id: z.string(),
            connectUrl: z.string(),
          }),
        })
        .optional()
        .default({
          invocation: {
            id: crypto.randomUUID(),
            region: "local",
          },
          session: {
            id: crypto.randomUUID(),
            connectUrl: "http://localhost:9001",
          },
        }),
    });

    const validatedData = invokeSchema.parse(body);

    // Use function name from URL path
    const finalFunctionName = functionName || validatedData.functionName;

    if (!finalFunctionName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Function name is required" }));
      return;
    }

    // Try to trigger the invocation
    const success = bridge.triggerInvocation(
      finalFunctionName,
      validatedData.params,
      validatedData.context,
      res,
    );

    if (!success) {
      // Runtime not ready or another invocation in progress
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Service unavailable",
          message: bridge.hasActiveInvocation()
            ? "Another invocation is in progress"
            : "No runtime connected",
        }),
      );
      return;
    }

    // The response will be completed later when the function completes
    // via completeWithSuccess or completeWithError in the bridge
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid request body",
          details: error,
        }),
      );
    } else {
      console.error(chalk.red("Error handling invoke:"), error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}

/**
 * Handle POST /2018-06-01/runtime/invocation/:requestId/response
 * This endpoint is called by the runtime when a function completes successfully.
 */
export async function handleInvocationResponse(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
  bridge: InvocationBridge,
): Promise<void> {
  try {
    // Parse the response body
    const body = await parseJsonBody(req);

    // Complete the invocation with success
    const success = bridge.completeWithSuccess(requestId, body);

    if (!success) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid request",
          message: "No matching invocation or request ID mismatch",
        }),
      );
      return;
    }

    // Send acknowledgment to the runtime
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "accepted" }));
  } catch (error) {
    console.error(chalk.red("Error handling response:"), error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

/**
 * Handle POST /2018-06-01/runtime/invocation/:requestId/error
 * This endpoint is called by the runtime when a function fails.
 */
export async function handleInvocationError(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
  bridge: InvocationBridge,
): Promise<void> {
  try {
    // Parse the error body
    const body = await parseJsonBody(req);

    // Validate error format
    const errorSchema = z.object({
      errorMessage: z.string(),
      errorType: z.string(),
      stackTrace: z.array(z.string()).optional().default([]),
    });

    const validatedError = errorSchema.parse(body);

    // Complete the invocation with error
    const success = bridge.completeWithError(
      requestId,
      validatedError as RuntimeError,
    );

    if (!success) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid request",
          message: "No matching invocation or request ID mismatch",
        }),
      );
      return;
    }

    // Send acknowledgment to the runtime
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "accepted" }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid error format",
          details: error,
        }),
      );
    } else {
      console.error(chalk.red("Error handling error report:"), error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}

