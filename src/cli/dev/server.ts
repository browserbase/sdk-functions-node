import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import chalk from "chalk";
import { type IInvocationBridge } from "./bridge.js";
import { type IRemoteBrowserManager } from "./browser-manager.js";
import { type IRequestHandlers } from "./handlers/index.js";

export interface ServerOptions {
  port: number;
  host: string;
  bridge: IInvocationBridge;
  browserManager: IRemoteBrowserManager;
  handlers: IRequestHandlers;
}

export interface RequestHandlerDeps {
  bridge: IInvocationBridge;
  browserManager: IRemoteBrowserManager;
  handlers: IRequestHandlers;
}

/**
 * Main request handler for the dev server
 * Extracted for testability
 */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RequestHandlerDeps,
): Promise<void> {
  const { handlers } = deps;
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const method = req.method || "GET";
  const path = url.pathname;

  console.log(chalk.gray(`[${method}] ${path}`));

  // Set CORS headers for local development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Route: GET /2018-06-01/runtime/invocation/next
    if (method === "GET" && path === "/2018-06-01/runtime/invocation/next") {
      await handlers.handleInvocationNext(req, res);
      return;
    }

    // Route: POST /v1/functions/:name/invoke
    const invokeMatch = path.match(/^\/v1\/functions\/([^/]+)\/invoke$/);
    if (method === "POST" && invokeMatch && invokeMatch[1]) {
      const functionName = invokeMatch[1];
      await handlers.handleFunctionInvoke(req, res, functionName);
      return;
    }

    // Route: POST /2018-06-01/runtime/invocation/:requestId/response
    const responseMatch = path.match(
      /^\/2018-06-01\/runtime\/invocation\/([^/]+)\/response$/,
    );
    if (method === "POST" && responseMatch && responseMatch[1]) {
      const requestId = responseMatch[1];
      await handlers.handleInvocationResponse(req, res, requestId);
      return;
    }

    // Route: POST /2018-06-01/runtime/invocation/:requestId/error
    const errorMatch = path.match(
      /^\/2018-06-01\/runtime\/invocation\/([^/]+)\/error$/,
    );
    if (method === "POST" && errorMatch && errorMatch[1]) {
      const requestId = errorMatch[1];
      await handlers.handleInvocationError(req, res, requestId);
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error(chalk.red("Server error:"), error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

export async function startServer(options: ServerOptions): Promise<Server> {
  const { port, host, bridge, browserManager, handlers } = options;

  // Set the session cleanup callback on the bridge
  bridge.setSessionCleanupCallback((sessionId: string) =>
    handlers.cleanupSession(sessionId, browserManager)
  );

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      await handleRequest(req, res, { bridge, browserManager, handlers });
    },
  );

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      resolve(server);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else if (error.code === "EACCES") {
        reject(new Error(`Permission denied to bind to port ${port}`));
      } else {
        reject(error);
      }
    });
  });
}
