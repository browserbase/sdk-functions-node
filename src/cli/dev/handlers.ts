import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { z } from "zod";
import chalk from "chalk";
import { type IInvocationBridge, type RuntimeError } from "./bridge.js";
import { type IRemoteBrowserManager } from "./browser-manager.js";
import type { PersistedFunctionManifest } from "../../types/definition.js";
import type { JSONSchemaInput } from "../../types/schema.js";

// Cache for function manifests
const functionManifests = new Map<
  string,
  PersistedFunctionManifest<JSONSchemaInput>
>();

/**
 * Load function manifests from .browserbase directory
 */
function loadFunctionManifests(): void {
  const manifestsDir = join(
    process.cwd(),
    ".browserbase",
    "functions",
    "manifests",
  );

  if (!existsSync(manifestsDir)) {
    console.log(
      chalk.yellow("⚠️  No .browserbase/functions/manifests directory found"),
    );
    console.log(
      chalk.gray("  Run your entrypoint file first to generate manifests"),
    );
    return;
  }

  try {
    const files = readdirSync(manifestsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const filePath = join(manifestsDir, file);
      const content = readFileSync(filePath, "utf-8");
      const manifest = JSON.parse(
        content,
      ) as PersistedFunctionManifest<JSONSchemaInput>;

      functionManifests.set(manifest.name, manifest);
      console.log(
        chalk.gray(`  Loaded manifest for function: ${manifest.name}`),
      );
    }

    if (functionManifests.size > 0) {
      console.log(
        chalk.green(`✓ Loaded ${functionManifests.size} function manifest(s)`),
      );
    } else {
      console.log(
        chalk.yellow(
          "⚠️  No function manifests found in .browserbase directory",
        ),
      );
    }
  } catch (error) {
    console.error(chalk.red("Failed to load function manifests:"), error);
  }
}

// Load manifests on startup
loadFunctionManifests();

/**
 * Interface for request handlers
 */
export interface IHandlers {
  /**
   * Cleanup a browser session after invocation completes
   */
  cleanupSession: (sessionId: string, browserManager: IRemoteBrowserManager) => Promise<void>;

  /**
   * Handle GET /2018-06-01/runtime/invocation/next
   * This endpoint is called by the runtime to get the next invocation.
   * We hold the connection until an invocation arrives.
   */
  handleInvocationNext: (
    req: IncomingMessage,
    res: ServerResponse,
    bridge: IInvocationBridge,
  ) => Promise<void>;

  /**
   * Handle POST /v1/functions/:name/invoke
   * This endpoint is called by external clients to invoke a function.
   */
  handleFunctionInvoke: (
    req: IncomingMessage,
    res: ServerResponse,
    functionName: string,
    bridge: IInvocationBridge,
    browserManager: IRemoteBrowserManager,
  ) => Promise<void>;

  /**
   * Handle POST /2018-06-01/runtime/invocation/:requestId/response
   * This endpoint is called by the runtime when a function completes successfully.
   */
  handleInvocationResponse: (
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    bridge: IInvocationBridge,
  ) => Promise<void>;

  /**
   * Handle POST /2018-06-01/runtime/invocation/:requestId/error
   * This endpoint is called by the runtime when a function fails.
   */
  handleInvocationError: (
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    bridge: IInvocationBridge,
  ) => Promise<void>;
}

/**
 * Cleanup a browser session after invocation completes
 */
async function cleanupSession(sessionId: string, browserManager: IRemoteBrowserManager): Promise<void> {
  await browserManager.closeSession(sessionId);
}

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
async function handleInvocationNext(
  _req: IncomingMessage,
  res: ServerResponse,
  bridge: IInvocationBridge,
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
async function handleFunctionInvoke(
  req: IncomingMessage,
  res: ServerResponse,
  functionName: string,
  bridge: IInvocationBridge,
  browserManager: IRemoteBrowserManager,
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
        .optional(),
    });

    const validatedData = invokeSchema.parse(body);

    // Use function name from URL path
    const finalFunctionName = functionName || validatedData.functionName;

    if (!finalFunctionName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Function name is required" }));
      return;
    }

    // Look up function manifest to get sessionConfig
    const manifest = functionManifests.get(finalFunctionName);

    if (!manifest) {
      console.error(
        chalk.red(
          `✗ Function "${finalFunctionName}" not found in registry`,
        ),
      );
      console.error(
        chalk.gray(
          "  Make sure the function is defined in your entrypoint file",
        ),
      );
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Function not found",
          message: `Function "${finalFunctionName}" not found in registry. Make sure it is defined with defineFn() in your entrypoint file.`,
        }),
      );
      return;
    }

    // Always create a browser session
    let session: { id: string; connectUrl: string };

    try {
      console.log(
        chalk.cyan(`Creating browser session for ${finalFunctionName}...`),
      );

      // Create session with function's sessionConfig if available
      const sessionConfig = manifest?.config?.sessionConfig || {};

      session = await browserManager.createSession(sessionConfig);
    } catch (error) {
      console.error(chalk.red("Failed to create browser session:"), error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Failed to create browser session",
          details: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }

    // Build context with the created session
    const context = validatedData.context || {
      invocation: {
        id: crypto.randomUUID(),
        region: "local",
      },
      session: session,
    };

    // Always use the created session
    context.session = session;

    // Try to trigger the invocation
    const success = bridge.triggerInvocation(
      finalFunctionName,
      validatedData.params,
      context,
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
async function handleInvocationResponse(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
  bridge: IInvocationBridge,
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
async function handleInvocationError(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
  bridge: IInvocationBridge,
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

/**
 * Exported handlers object implementing IHandlers interface
 */
export const handlers: IHandlers = {
  cleanupSession,
  handleInvocationNext,
  handleFunctionInvoke,
  handleInvocationResponse,
  handleInvocationError,
};
