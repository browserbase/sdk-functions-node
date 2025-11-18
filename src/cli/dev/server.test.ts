import { describe, it, beforeEach } from "node:test";
import { expect } from "@std/expect";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { type RequestHandlerDeps, handleRequest } from "./server.js";
import type { IInvocationBridge } from "./bridge.js";
import type { IRemoteBrowserManager } from "./browser-manager.js";
import type { IRequestHandlers } from "./handlers/index.js";

/**
 * Creates a mock implementation of IRequestHandlers
 */
class MockHandlers implements IRequestHandlers {
  public handleInvocationNextCalls: Array<[IncomingMessage, ServerResponse]> =
    [];
  public handleFunctionInvokeCalls: Array<
    [IncomingMessage, ServerResponse, string]
  > = [];
  public handleInvocationResponseCalls: Array<
    [IncomingMessage, ServerResponse, string]
  > = [];
  public handleInvocationErrorCalls: Array<
    [IncomingMessage, ServerResponse, string]
  > = [];

  private handleInvocationNextImpl?: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<void>;
  private handleFunctionInvokeImpl?: (
    req: IncomingMessage,
    res: ServerResponse,
    functionName: string,
  ) => Promise<void>;
  private handleInvocationResponseImpl?: (
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ) => Promise<void>;
  private handleInvocationErrorImpl?: (
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ) => Promise<void>;

  async handleInvocationNext(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    this.handleInvocationNextCalls.push([req, res]);
    if (this.handleInvocationNextImpl) {
      await this.handleInvocationNextImpl(req, res);
    }
  }

  async handleFunctionInvoke(
    req: IncomingMessage,
    res: ServerResponse,
    functionName: string,
  ): Promise<void> {
    this.handleFunctionInvokeCalls.push([req, res, functionName]);
    if (this.handleFunctionInvokeImpl) {
      await this.handleFunctionInvokeImpl(req, res, functionName);
    }
  }

  async handleInvocationResponse(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void> {
    this.handleInvocationResponseCalls.push([req, res, requestId]);
    if (this.handleInvocationResponseImpl) {
      await this.handleInvocationResponseImpl(req, res, requestId);
    }
  }

  async handleInvocationError(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void> {
    this.handleInvocationErrorCalls.push([req, res, requestId]);
    if (this.handleInvocationErrorImpl) {
      await this.handleInvocationErrorImpl(req, res, requestId);
    }
  }

  // Methods to set custom implementations for testing specific behaviors
  setHandleInvocationNextImpl(
    impl: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) {
    this.handleInvocationNextImpl = impl;
  }

  setHandleFunctionInvokeImpl(
    impl: (
      req: IncomingMessage,
      res: ServerResponse,
      functionName: string,
    ) => Promise<void>,
  ) {
    this.handleFunctionInvokeImpl = impl;
  }

  setHandleInvocationResponseImpl(
    impl: (
      req: IncomingMessage,
      res: ServerResponse,
      requestId: string,
    ) => Promise<void>,
  ) {
    this.handleInvocationResponseImpl = impl;
  }

  setHandleInvocationErrorImpl(
    impl: (
      req: IncomingMessage,
      res: ServerResponse,
      requestId: string,
    ) => Promise<void>,
  ) {
    this.handleInvocationErrorImpl = impl;
  }

  reset() {
    this.handleInvocationNextCalls = [];
    this.handleFunctionInvokeCalls = [];
    this.handleInvocationResponseCalls = [];
    this.handleInvocationErrorCalls = [];
    delete this.handleInvocationNextImpl;
    delete this.handleFunctionInvokeImpl;
    delete this.handleInvocationResponseImpl;
    delete this.handleInvocationErrorImpl;
  }
}

/**
 * Creates a mock implementation of IInvocationBridge
 */
class MockBridge implements IInvocationBridge {
  public setSessionCleanupCallbackCalls: Array<
    [(sessionId: string) => Promise<void>]
  > = [];
  public holdNextConnectionCalls: Array<[ServerResponse]> = [];
  public triggerInvocationCalls: Array<
    [string, unknown, unknown, ServerResponse]
  > = [];
  public completeWithSuccessCalls: Array<[string, unknown]> = [];
  public completeWithErrorCalls: Array<[string, unknown]> = [];

  setSessionCleanupCallback(
    callback: (sessionId: string) => Promise<void>,
  ): void {
    this.setSessionCleanupCallbackCalls.push([callback]);
  }

  holdNextConnection(res: ServerResponse): void {
    this.holdNextConnectionCalls.push([res]);
  }

  triggerInvocation(
    functionName: string,
    params: unknown,
    context: unknown,
    clientRes: ServerResponse,
  ): boolean {
    this.triggerInvocationCalls.push([
      functionName,
      params,
      context,
      clientRes,
    ]);
    return true;
  }

  completeWithSuccess(requestId: string, result: unknown): boolean {
    this.completeWithSuccessCalls.push([requestId, result]);
    return true;
  }

  completeWithError(requestId: string, error: unknown): boolean {
    this.completeWithErrorCalls.push([requestId, error]);
    return true;
  }

  isReady(): boolean {
    return true;
  }

  hasActiveInvocation(): boolean {
    return false;
  }

  getCurrentRequestId(): string | null {
    return null;
  }

  isRuntimeConnected(): boolean {
    return true;
  }

  reset() {
    this.setSessionCleanupCallbackCalls = [];
    this.holdNextConnectionCalls = [];
    this.triggerInvocationCalls = [];
    this.completeWithSuccessCalls = [];
    this.completeWithErrorCalls = [];
  }
}

/**
 * Creates a mock implementation of IRemoteBrowserManager
 */
class MockBrowserManager implements IRemoteBrowserManager {
  public initializeCalls: Array<[]> = [];
  public createSessionCalls: Array<[unknown]> = [];
  public closeSessionCalls: Array<[string]> = [];

  async initialize(): Promise<void> {
    this.initializeCalls.push([]);
  }

  async createSession(
    config?: unknown,
  ): Promise<{ id: string; connectUrl: string }> {
    this.createSessionCalls.push([config]);
    return { id: "test-session-id", connectUrl: "ws://localhost:9222" };
  }

  async closeSession(sessionId: string): Promise<void> {
    this.closeSessionCalls.push([sessionId]);
  }

  getProjectId(): string {
    return "test-project-id";
  }

  isInitialized(): boolean {
    return true;
  }

  reset() {
    this.initializeCalls = [];
    this.createSessionCalls = [];
    this.closeSessionCalls = [];
  }
}

/**
 * Creates a mock ServerResponse with tracking for all method calls
 */
class MockServerResponse extends ServerResponse {
  public setHeaderCalls: Array<[string, string | number | string[]]> = [];
  public writeHeadCalls: Array<[number, unknown?]> = [];
  public endCalls: Array<[unknown?]> = [];
  public writeCalls: Array<[unknown]> = [];

  constructor(req: IncomingMessage) {
    super(req);
  }

  override setHeader(name: string, value: string | number | string[]): this {
    this.setHeaderCalls.push([name, value]);
    return this;
  }

  override writeHead(statusCode: number, headers?: unknown): this {
    this.writeHeadCalls.push([statusCode, headers]);
    return this;
  }

  override end(chunk?: unknown): this {
    this.endCalls.push([chunk]);
    return this;
  }

  override write(chunk: unknown): boolean {
    this.writeCalls.push([chunk]);
    return true;
  }

  reset() {
    this.setHeaderCalls = [];
    this.writeHeadCalls = [];
    this.endCalls = [];
    this.writeCalls = [];
  }
}

describe("handleRequest", () => {
  let req: IncomingMessage;
  let res: MockServerResponse;
  let deps: RequestHandlerDeps;
  let socket: Socket;
  let mockHandlers: MockHandlers;
  let mockBridge: MockBridge;
  let mockBrowserManager: MockBrowserManager;

  beforeEach(() => {
    // Create mock socket
    socket = new Socket();

    // Create mock request
    req = new IncomingMessage(socket);
    req.headers = { host: "localhost:3000" };

    // Create mock response
    res = new MockServerResponse(req);

    // Create mock implementations
    mockHandlers = new MockHandlers();
    mockBridge = new MockBridge();
    mockBrowserManager = new MockBrowserManager();

    // Create deps with mock implementations
    deps = {
      handlers: mockHandlers,
      bridge: mockBridge,
      browserManager: mockBrowserManager,
    };
  });

  describe("CORS Headers", () => {
    it("should set CORS headers for all requests", async () => {
      req.method = "GET";
      req.url = "/unknown";

      await handleRequest(req, res, deps);

      expect(res.setHeaderCalls.length).toBeGreaterThan(0);
      expect(res.setHeaderCalls).toContainEqual([
        "Access-Control-Allow-Origin",
        "*",
      ]);
      expect(res.setHeaderCalls).toContainEqual([
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS",
      ]);
      expect(res.setHeaderCalls).toContainEqual([
        "Access-Control-Allow-Headers",
        "Content-Type",
      ]);
    });

    it("should handle OPTIONS preflight requests", async () => {
      req.method = "OPTIONS";
      req.url = "/any/path";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([200]);
      expect(res.endCalls).toContainEqual([undefined]);
    });
  });

  describe("Route: GET /2018-06-01/runtime/invocation/next", () => {
    it("should call handleInvocationNext for the correct route", async () => {
      req.method = "GET";
      req.url = "/2018-06-01/runtime/invocation/next";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleInvocationNextCalls.length).toBe(1);
      expect(mockHandlers.handleInvocationNextCalls[0]?.[0]).toBe(req);
      expect(mockHandlers.handleInvocationNextCalls[0]?.[1]).toBe(res);
    });
  });

  describe("Route: POST /v1/functions/:name/invoke", () => {
    it("should call handleFunctionInvoke with correct function name", async () => {
      req.method = "POST";
      req.url = "/v1/functions/myFunction/invoke";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleFunctionInvokeCalls.length).toBe(1);
      expect(mockHandlers.handleFunctionInvokeCalls[0]?.[0]).toBe(req);
      expect(mockHandlers.handleFunctionInvokeCalls[0]?.[1]).toBe(res);
      expect(mockHandlers.handleFunctionInvokeCalls[0]?.[2]).toBe("myFunction");
    });

    it("should handle function names with special characters", async () => {
      req.method = "POST";
      req.url = "/v1/functions/my-function_123/invoke";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleFunctionInvokeCalls.length).toBe(1);
      expect(mockHandlers.handleFunctionInvokeCalls[0]?.[2]).toBe(
        "my-function_123",
      );
    });
  });

  describe("Route: POST /2018-06-01/runtime/invocation/:requestId/response", () => {
    it("should call handleInvocationResponse with correct request ID", async () => {
      req.method = "POST";
      req.url = "/2018-06-01/runtime/invocation/req-123/response";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleInvocationResponseCalls.length).toBe(1);
      expect(mockHandlers.handleInvocationResponseCalls[0]?.[0]).toBe(req);
      expect(mockHandlers.handleInvocationResponseCalls[0]?.[1]).toBe(res);
      expect(mockHandlers.handleInvocationResponseCalls[0]?.[2]).toBe(
        "req-123",
      );
    });

    it("should handle request IDs with UUIDs", async () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      req.method = "POST";
      req.url = `/2018-06-01/runtime/invocation/${uuid}/response`;

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleInvocationResponseCalls.length).toBe(1);
      expect(mockHandlers.handleInvocationResponseCalls[0]?.[2]).toBe(uuid);
    });
  });

  describe("Route: POST /2018-06-01/runtime/invocation/:requestId/error", () => {
    it("should call handleInvocationError with correct request ID", async () => {
      req.method = "POST";
      req.url = "/2018-06-01/runtime/invocation/req-456/error";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleInvocationErrorCalls.length).toBe(1);
      expect(mockHandlers.handleInvocationErrorCalls[0]?.[0]).toBe(req);
      expect(mockHandlers.handleInvocationErrorCalls[0]?.[1]).toBe(res);
      expect(mockHandlers.handleInvocationErrorCalls[0]?.[2]).toBe("req-456");
    });
  });

  describe("Unknown Routes", () => {
    it("should return 404 for unknown GET routes", async () => {
      req.method = "GET";
      req.url = "/unknown/route";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Not found" }),
      ]);
    });

    it("should return 404 for unknown POST routes", async () => {
      req.method = "POST";
      req.url = "/api/v2/something";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Not found" }),
      ]);
    });

    it("should return 404 for incorrect method on known routes", async () => {
      req.method = "DELETE";
      req.url = "/2018-06-01/runtime/invocation/next";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Not found" }),
      ]);
    });
  });

  describe("Error Handling", () => {
    it("should handle errors thrown by handlers", async () => {
      const error = new Error("Handler error");
      mockHandlers.setHandleInvocationNextImpl(async () => {
        throw error;
      });

      req.method = "GET";
      req.url = "/2018-06-01/runtime/invocation/next";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        500,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Internal server error" }),
      ]);
    });

    it("should handle malformed URLs gracefully", async () => {
      req.method = "GET";
      req.url = "//malformed//url//";

      await handleRequest(req, res, deps);

      // Should still set CORS headers
      expect(res.setHeaderCalls).toContainEqual([
        "Access-Control-Allow-Origin",
        "*",
      ]);
      // Should return 404 as it doesn't match any route
      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
    });

    it("should handle missing host header", async () => {
      req.headers = {};
      req.method = "GET";
      req.url = "/2018-06-01/runtime/invocation/next";

      await handleRequest(req, res, deps);

      // Should still work without host header
      expect(mockHandlers.handleInvocationNextCalls.length).toBe(1);
      expect(mockHandlers.handleInvocationNextCalls[0]?.[0]).toBe(req);
      expect(mockHandlers.handleInvocationNextCalls[0]?.[1]).toBe(res);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty URL", async () => {
      req.method = "GET";
      req.url = "";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Not found" }),
      ]);
    });

    it("should handle undefined URL", async () => {
      req.method = "GET";
      req.url = undefined;

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Not found" }),
      ]);
    });

    it("should handle undefined method (defaults to GET)", async () => {
      req.method = undefined;
      req.url = "/unknown";

      await handleRequest(req, res, deps);

      expect(res.writeHeadCalls).toContainEqual([
        404,
        {
          "Content-Type": "application/json",
        },
      ]);
      expect(res.endCalls).toContainEqual([
        JSON.stringify({ error: "Not found" }),
      ]);
    });

    it("should handle URLs with query parameters", async () => {
      req.method = "POST";
      req.url = "/v1/functions/testFunc/invoke?param1=value1&param2=value2";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleFunctionInvokeCalls.length).toBe(1);
      expect(mockHandlers.handleFunctionInvokeCalls[0]?.[2]).toBe("testFunc");
    });

    it("should handle URLs with hash fragments", async () => {
      req.method = "GET";
      req.url = "/2018-06-01/runtime/invocation/next#fragment";

      await handleRequest(req, res, deps);

      expect(mockHandlers.handleInvocationNextCalls.length).toBe(1);
      expect(mockHandlers.handleInvocationNextCalls[0]?.[0]).toBe(req);
      expect(mockHandlers.handleInvocationNextCalls[0]?.[1]).toBe(res);
    });
  });
});
