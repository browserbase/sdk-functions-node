import { ServerResponse } from "http";
import { randomUUID } from "crypto";
import chalk from "chalk";

interface HeldConnection {
  response: ServerResponse;
  timestamp: number;
}

interface FunctionInvocationContext {
  invocation: {
    id: string;
    region?: string;
  };
  session: {
    id: string;
    connectUrl: string;
  };
}

export interface InvocationPayload {
  functionName: string;
  params: unknown;
  context: FunctionInvocationContext;
}

export interface RuntimeError {
  errorMessage: string;
  errorType: string;
  stackTrace: string[];
}

/**
 * Manages the lifecycle of invocations, bridging between external invoke requests
 * and the function runtime's polling mechanism.
 */
export class InvocationBridge {
  private nextConnection: HeldConnection | null = null;
  private invokeConnection: HeldConnection | null = null;
  private currentRequestId: string | null = null;
  private currentFunctionName: string | null = null;
  private verbose: boolean;
  private runtimeConnectedOnce: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Hold a connection from the runtime waiting for the next invocation.
   * This corresponds to the SDK calling GET /invocation/next.
   */
  public holdNextConnection(response: ServerResponse): void {
    if (this.nextConnection) {
      // If there's already a held connection, close the old one
      this.nextConnection.response.writeHead(503, {
        "Content-Type": "application/json",
      });
      this.nextConnection.response.end(
        JSON.stringify({ error: "Another runtime connected" }),
      );
    }

    this.nextConnection = {
      response,
      timestamp: Date.now(),
    };

    // Mark that runtime has connected at least once
    this.runtimeConnectedOnce = true;

    if (this.verbose) {
      console.log(
        chalk.cyan("🔌 Function runtime connected, ready for invocations"),
      );
    }
  }

  /**
   * Trigger an invocation by completing the held /next connection with invoke data
   * and holding the invoke connection until the function completes.
   */
  public triggerInvocation(
    functionName: string,
    params: unknown,
    context: FunctionInvocationContext,
    invokeResponse: ServerResponse,
  ): boolean {
    // Check if runtime is ready (has a held /next connection)
    if (!this.nextConnection) {
      if (this.verbose) {
        console.log(
          chalk.yellow("⚠️  No runtime connected to handle invocation"),
        );
      }
      return false;
    }

    // Check if there's already an active invocation
    if (this.invokeConnection) {
      if (this.verbose) {
        console.log(
          chalk.yellow("⚠️  Another invocation is already in progress"),
        );
      }
      return false;
    }

    // Generate a request ID for this invocation
    const requestId = randomUUID();
    this.currentRequestId = requestId;
    this.currentFunctionName = functionName;

    // Hold the invoke connection
    this.invokeConnection = {
      response: invokeResponse,
      timestamp: Date.now(),
    };

    // Complete the held /next connection with the invocation payload
    const payload: InvocationPayload = {
      functionName,
      params,
      context,
    };

    // Set Lambda runtime headers
    this.nextConnection.response.writeHead(200, {
      "Content-Type": "application/json",
      "Lambda-Runtime-Aws-Request-Id": requestId,
      "Lambda-Runtime-Deadline-Ms": String(Date.now() + 300000), // 5 minutes from now
      "Lambda-Runtime-Invoked-Function-Arn": `arn:aws:lambda:us-east-1:000000000000:function:${functionName}`,
    });

    this.nextConnection.response.end(JSON.stringify(payload));
    this.nextConnection = null;

    console.log(
      chalk.blue(
        `🚀 Invoking function '${functionName}' (request-id: ${requestId})`,
      ),
    );

    return true;
  }

  /**
   * Complete the held invoke connection with a successful response.
   */
  public completeWithSuccess(requestId: string, result: unknown): boolean {
    // Validate request ID matches
    if (requestId !== this.currentRequestId) {
      if (this.verbose) {
        console.log(
          chalk.yellow(
            `⚠️  Request ID mismatch: expected ${this.currentRequestId}, got ${requestId}`,
          ),
        );
      }
      return false;
    }

    // Check if there's an active invocation
    if (!this.invokeConnection) {
      if (this.verbose) {
        console.log(chalk.yellow("⚠️  No active invocation to complete"));
      }
      return false;
    }

    // Complete the held invoke connection
    this.invokeConnection.response.writeHead(200, {
      "Content-Type": "application/json",
    });
    this.invokeConnection.response.end(JSON.stringify(result ?? {}));

    console.log(
      chalk.green(
        `✓ Function '${this.currentFunctionName}' completed successfully`,
      ),
    );

    // Clean up state
    this.invokeConnection = null;
    this.currentRequestId = null;
    this.currentFunctionName = null;

    return true;
  }

  /**
   * Complete the held invoke connection with an error response.
   */
  public completeWithError(requestId: string, error: RuntimeError): boolean {
    // Validate request ID matches
    if (requestId !== this.currentRequestId) {
      if (this.verbose) {
        console.log(
          chalk.yellow(
            `⚠️  Request ID mismatch: expected ${this.currentRequestId}, got ${requestId}`,
          ),
        );
      }
      return false;
    }

    // Check if there's an active invocation
    if (!this.invokeConnection) {
      if (this.verbose) {
        console.log(chalk.yellow("⚠️  No active invocation to complete"));
      }
      return false;
    }

    // Complete the held invoke connection with error
    this.invokeConnection.response.writeHead(500, {
      "Content-Type": "application/json",
    });
    this.invokeConnection.response.end(
      JSON.stringify({
        error: {
          message: error.errorMessage,
          type: error.errorType,
          stackTrace: error.stackTrace,
        },
      }),
    );

    console.log(
      chalk.red(
        `✗ Function '${this.currentFunctionName}' failed: ${error.errorMessage}`,
      ),
    );

    // Clean up state
    this.invokeConnection = null;
    this.currentRequestId = null;
    this.currentFunctionName = null;

    return true;
  }

  /**
   * Check if the bridge is ready to accept invocations.
   */
  public isReady(): boolean {
    return this.nextConnection !== null && this.invokeConnection === null;
  }

  /**
   * Check if there's an active invocation.
   */
  public hasActiveInvocation(): boolean {
    return this.invokeConnection !== null;
  }

  /**
   * Get the current request ID if there's an active invocation.
   */
  public getCurrentRequestId(): string | null {
    return this.currentRequestId;
  }

  /**
   * Check if the runtime has connected at least once.
   */
  public isRuntimeConnected(): boolean {
    return this.runtimeConnectedOnce && this.nextConnection !== null;
  }
}

