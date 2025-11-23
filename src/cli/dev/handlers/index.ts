import { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { z } from "zod";
import chalk from "chalk";
import { type IInvocationBridge } from "../bridge.js";
import { type IRemoteBrowserManager } from "../browser-manager.js";
import { type IManifestStore } from "./manifest-store.js";
import { requestParser } from "./request-parser.js";
import { responseBuilder } from "./response-builder.js";
import { RuntimeError } from "../../../schemas/events.js";
import { FunctionInvocationContext } from "../../../schemas/invocation.js";

/**
 * Dependencies required by the request handlers
 */
export interface RequestHandlerDependencies {
  bridge: IInvocationBridge;
  browserManager: IRemoteBrowserManager;
  manifestStore: IManifestStore;
}

/**
 * Interface for request handlers
 */
export interface IRequestHandlers {
  /**
   * Handle GET /2018-06-01/runtime/invocation/next
   * This endpoint is called by the runtime to get the next invocation.
   * We hold the connection until an invocation arrives.
   */
  handleInvocationNext(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void>;

  /**
   * Handle POST /v1/functions/:name/invoke
   * This endpoint is called by external clients to invoke a function.
   */
  handleFunctionInvoke(
    req: IncomingMessage,
    res: ServerResponse,
    functionName: string,
  ): Promise<void>;

  /**
   * Handle POST /2018-06-01/runtime/invocation/:requestId/response
   * This endpoint is called by the runtime when a function completes successfully.
   */
  handleInvocationResponse(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void>;

  /**
   * Handle POST /2018-06-01/runtime/invocation/:requestId/error
   * This endpoint is called by the runtime when a function fails.
   */
  handleInvocationError(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void>;
}

/**
 * Implementation of request handlers for the dev server
 */
export class DevServerHandlers implements IRequestHandlers {
  private readonly bridge: IInvocationBridge;
  private readonly browserManager: IRemoteBrowserManager;
  private readonly manifestStore: IManifestStore;

  constructor(deps: RequestHandlerDependencies) {
    this.bridge = deps.bridge;
    this.browserManager = deps.browserManager;
    this.manifestStore = deps.manifestStore;

    // Set up the session cleanup callback in the bridge
    this.bridge.setSessionCleanupCallback(async (sessionId: string) => {
      await this.cleanupSession(sessionId);
    });
  }

  /**
   * Handle GET /2018-06-01/runtime/invocation/next
   */
  public async handleInvocationNext(
    _req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Hold the connection in the bridge
    this.bridge.holdNextConnection(res);

    // The response will be completed later when an invocation arrives
    // via triggerInvocation in the bridge
  }

  /**
   * Handle POST /v1/functions/:name/invoke
   */
  public async handleFunctionInvoke(
    req: IncomingMessage,
    res: ServerResponse,
    functionName: string,
  ): Promise<void> {
    try {
      // Define the invoke request schema
      const invokeSchema = z.object({
        functionName: z.string().optional(),
        params: z.unknown().default({}),
        context: FunctionInvocationContext.optional(),
      });

      // Parse and validate the request body
      const validatedData = await requestParser.parseAndValidate(
        req,
        invokeSchema,
      );

      // Use function name from URL path
      const finalFunctionName = functionName || validatedData.functionName;

      if (!finalFunctionName) {
        responseBuilder.sendBadRequest(res, "Function name is required");
        return;
      }

      // Look up function manifest to get sessionConfig
      const manifest = this.manifestStore.getManifest(finalFunctionName);

      if (!manifest) {
        console.error(
          chalk.red(`✗ Function "${finalFunctionName}" not found in registry`),
        );
        console.error(
          chalk.gray(
            "  Make sure the function is defined in your entrypoint file",
          ),
        );
        responseBuilder.sendNotFound(
          res,
          `Function "${finalFunctionName}" not found in registry. Make sure it is defined with defineFn() in your entrypoint file.`,
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
        session = await this.browserManager.createSession(sessionConfig);
      } catch (error) {
        console.error(chalk.red("Failed to create browser session:"), error);
        responseBuilder.sendInternalError(
          res,
          "Failed to create browser session",
          error instanceof Error ? error.message : String(error),
        );
        return;
      }

      // Build context with the created session
      const context = validatedData.context || {
        invocation: {
          id: randomUUID(),
          region: "local",
        },
        session: session,
      };

      // Always use the created session
      context.session = session;

      // Try to trigger the invocation
      const success = this.bridge.triggerInvocation(
        finalFunctionName,
        validatedData.params,
        context,
        res,
      );

      if (!success) {
        // Runtime not ready or another invocation in progress
        // Clean up the session we just created since we won't use it
        await this.cleanupSession(session.id);

        responseBuilder.sendServiceUnavailable(
          res,
          this.bridge.hasActiveInvocation()
            ? "Another invocation is in progress"
            : "No runtime connected",
        );
        return;
      }

      // The response will be completed later when the function completes
      // via completeWithSuccess or completeWithError in the bridge
    } catch (error) {
      if (error instanceof z.ZodError) {
        responseBuilder.sendBadRequest(res, "Invalid request body", error);
      } else {
        console.error(chalk.red("Error handling invoke:"), error);
        responseBuilder.sendInternalError(res);
      }
    }
  }

  /**
   * Handle POST /2018-06-01/runtime/invocation/:requestId/response
   */
  public async handleInvocationResponse(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void> {
    try {
      // Parse the response body
      const body = await requestParser.parseJsonBody(req);

      // Complete the invocation with success
      const success = this.bridge.completeWithSuccess(requestId, body);

      if (!success) {
        responseBuilder.sendBadRequest(
          res,
          "No matching invocation or request ID mismatch",
        );
        return;
      }

      // Send acknowledgment to the runtime
      responseBuilder.sendAccepted(res);
    } catch (error) {
      console.error(chalk.red("Error handling response:"), error);
      responseBuilder.sendInternalError(res);
    }
  }

  /**
   * Handle POST /2018-06-01/runtime/invocation/:requestId/error
   */
  public async handleInvocationError(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void> {
    try {
      // Parse and validate the error body using SDK schema
      const validatedError = await requestParser.parseAndValidate(
        req,
        RuntimeError,
      );

      // Complete the invocation with error
      const success = this.bridge.completeWithError(requestId, validatedError);

      if (!success) {
        responseBuilder.sendBadRequest(
          res,
          "No matching invocation or request ID mismatch",
        );
        return;
      }

      // Send acknowledgment to the runtime
      responseBuilder.sendAccepted(res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        responseBuilder.sendBadRequest(res, "Invalid error format", error);
      } else {
        console.error(chalk.red("Error handling error report:"), error);
        responseBuilder.sendInternalError(res);
      }
    }
  }

  /**
   * Private method to cleanup a browser session
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    try {
      await this.browserManager.closeSession(sessionId);
    } catch (error) {
      console.error(
        chalk.red(`Failed to cleanup session ${sessionId}:`),
        error,
      );
    }
  }
}
