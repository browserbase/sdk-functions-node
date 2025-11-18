import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { waitForAndHandleInvocation } from "./loop.js";
import type { IRuntimeClient } from "./index.js";
import type { RuntimeEvent } from "../schemas/events.js";
import type { FunctionManifest } from "../types/definition.js";
import type { FunctionHandlerCallbackReturnValue } from "../types/handler.js";

describe("waitForAndHandleInvocation", () => {
  let mockClient: IRuntimeClient;
  let handleProductionFailure: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    // Create a fresh mock client for each test
    mockClient = {
      waitForNextInvocation: mock.fn<IRuntimeClient["waitForNextInvocation"]>(),
      getFunctionDefinitionByName:
        mock.fn<IRuntimeClient["getFunctionDefinitionByName"]>(),
      executeFunction: mock.fn<IRuntimeClient["executeFunction"]>(),
      handleSuccess: mock.fn<IRuntimeClient["handleSuccess"]>(),
      handleFailure: mock.fn<IRuntimeClient["handleFailure"]>(),
    };

    handleProductionFailure = mock.fn<(error: unknown) => void>();
  });

  describe("successful execution", () => {
    test("processes invocation and calls handleSuccess", async () => {
      const mockEvent: RuntimeEvent = {
        requestId: "test-123",
        event: {
          functionName: "testFunction",
          params: {},
          context: {
            invocation: { id: "inv-123" },
            session: { id: "session-123", connectUrl: "ws://test" },
          },
        },
      };

      const mockFunctionDef: FunctionManifest<unknown> = {
        name: "testFunction",
        handler: async () => ({ result: "test" }),
        config: {},
      };

      const mockResult: FunctionHandlerCallbackReturnValue = {
        result: "success",
      };

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.resolve(mockEvent),
      );

      const getFunctionDefinitionByNameMock =
        mockClient.getFunctionDefinitionByName as unknown as ReturnType<
          typeof mock.fn
        >;
      getFunctionDefinitionByNameMock.mock.mockImplementationOnce(
        () => mockFunctionDef,
      );

      const executeFunctionMock =
        mockClient.executeFunction as unknown as ReturnType<typeof mock.fn>;
      executeFunctionMock.mock.mockImplementationOnce(() =>
        Promise.resolve(mockResult),
      );

      const handleSuccessMock =
        mockClient.handleSuccess as unknown as ReturnType<typeof mock.fn>;
      handleSuccessMock.mock.mockImplementationOnce(() => Promise.resolve());

      // Execute
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert
      assert.strictEqual(waitForNextInvocationMock.mock.callCount(), 1);
      assert.strictEqual(getFunctionDefinitionByNameMock.mock.callCount(), 1);
      assert.strictEqual(
        getFunctionDefinitionByNameMock.mock.calls[0]?.arguments[0],
        "testFunction",
      );
      assert.strictEqual(executeFunctionMock.mock.callCount(), 1);
      assert.deepStrictEqual(
        executeFunctionMock.mock.calls[0]?.arguments[0],
        mockEvent.event,
      );
      assert.strictEqual(handleSuccessMock.mock.callCount(), 1);
      assert.strictEqual(
        handleSuccessMock.mock.calls[0]?.arguments[0],
        "test-123",
      );
      assert.deepStrictEqual(
        handleSuccessMock.mock.calls[0]?.arguments[1],
        mockResult,
      );
      assert.strictEqual(
        (
          mockClient.handleFailure as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(handleProductionFailure.mock.callCount(), 0);
    });
  });

  describe("user code error handling", () => {
    test("catches execution errors and calls handleFailure", async () => {
      const mockEvent: RuntimeEvent = {
        requestId: "error-123",
        event: {
          functionName: "failingFunction",
          params: {},
          context: {
            invocation: { id: "inv-456" },
            session: { id: "session-456", connectUrl: "ws://test" },
          },
        },
      };

      const mockFunctionDef: FunctionManifest<unknown> = {
        name: "failingFunction",
        handler: async () => {
          throw new Error("User error");
        },
        config: {},
      };

      const userError = new Error("Function execution failed");

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.resolve(mockEvent),
      );

      const getFunctionDefinitionByNameMock =
        mockClient.getFunctionDefinitionByName as unknown as ReturnType<
          typeof mock.fn
        >;
      getFunctionDefinitionByNameMock.mock.mockImplementationOnce(
        () => mockFunctionDef,
      );

      const executeFunctionMock =
        mockClient.executeFunction as unknown as ReturnType<typeof mock.fn>;
      executeFunctionMock.mock.mockImplementationOnce(() =>
        Promise.reject(userError),
      );

      const handleFailureMock =
        mockClient.handleFailure as unknown as ReturnType<typeof mock.fn>;
      handleFailureMock.mock.mockImplementationOnce(() => Promise.resolve());

      // Execute
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert
      assert.strictEqual(handleFailureMock.mock.callCount(), 1);
      assert.strictEqual(
        handleFailureMock.mock.calls[0]?.arguments[0],
        "error-123",
      );
      assert.strictEqual(
        handleFailureMock.mock.calls[0]?.arguments[1],
        userError,
      );
      assert.strictEqual(
        (
          mockClient.handleSuccess as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(handleProductionFailure.mock.callCount(), 0);
    });
  });

  describe("system error handling", () => {
    test("handles function not found as system error", async () => {
      const mockEvent: RuntimeEvent = {
        requestId: "notfound-123",
        event: {
          functionName: "nonExistentFunction",
          params: {},
          context: {
            invocation: { id: "inv-789" },
            session: { id: "session-789", connectUrl: "ws://test" },
          },
        },
      };

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.resolve(mockEvent),
      );

      const getFunctionDefinitionByNameMock =
        mockClient.getFunctionDefinitionByName as unknown as ReturnType<
          typeof mock.fn
        >;
      getFunctionDefinitionByNameMock.mock.mockImplementationOnce(() => null); // Function not found

      // Execute
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert - system error means no success/failure handlers called
      assert.strictEqual(
        (
          mockClient.executeFunction as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(
        (
          mockClient.handleSuccess as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(
        (
          mockClient.handleFailure as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(handleProductionFailure.mock.callCount(), 1); // Now called for all fatal errors
    });

    test("calls handleProductionFailure in production environment", async () => {
      const systemError = new Error("Fatal system error");

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.reject(systemError),
      );

      // Execute
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert
      assert.strictEqual(handleProductionFailure.mock.callCount(), 1);
      assert.strictEqual(
        handleProductionFailure.mock.calls[0]?.arguments[0],
        systemError,
      );
      assert.strictEqual(
        (
          mockClient.handleSuccess as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(
        (
          mockClient.handleFailure as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
    });

    test("calls handleProductionFailure for all fatal errors", async () => {
      const systemError = new Error("Fatal system error");

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.reject(systemError),
      );

      // Execute
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert - now always calls handleProductionFailure for fatal errors
      assert.strictEqual(handleProductionFailure.mock.callCount(), 1);
      assert.strictEqual(
        handleProductionFailure.mock.calls[0]?.arguments[0],
        systemError,
      );
      assert.strictEqual(
        (
          mockClient.handleSuccess as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
      assert.strictEqual(
        (
          mockClient.handleFailure as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        0,
      );
    });
  });

  describe("edge cases", () => {
    test("handles errors in handleSuccess gracefully", async () => {
      const mockEvent: RuntimeEvent = {
        requestId: "test-456",
        event: {
          functionName: "testFunction",
          params: {},
          context: {
            invocation: { id: "inv-321" },
            session: { id: "session-321", connectUrl: "ws://test" },
          },
        },
      };

      const mockFunctionDef: FunctionManifest<unknown> = {
        name: "testFunction",
        handler: async () => ({ result: "test" }),
        config: {},
      };

      const handleSuccessError = new Error("Failed to report success");

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.resolve(mockEvent),
      );

      const getFunctionDefinitionByNameMock =
        mockClient.getFunctionDefinitionByName as unknown as ReturnType<
          typeof mock.fn
        >;
      getFunctionDefinitionByNameMock.mock.mockImplementationOnce(
        () => mockFunctionDef,
      );

      const executeFunctionMock =
        mockClient.executeFunction as unknown as ReturnType<typeof mock.fn>;
      executeFunctionMock.mock.mockImplementationOnce(() =>
        Promise.resolve({ result: "success" }),
      );

      const handleSuccessMock =
        mockClient.handleSuccess as unknown as ReturnType<typeof mock.fn>;
      handleSuccessMock.mock.mockImplementationOnce(() =>
        Promise.reject(handleSuccessError),
      );

      // Execute - should handle the error as a system error
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert
      assert.strictEqual(handleSuccessMock.mock.callCount(), 1);
      assert.strictEqual(handleProductionFailure.mock.callCount(), 1);
      assert.strictEqual(
        handleProductionFailure.mock.calls[0]?.arguments[0],
        handleSuccessError,
      );
    });

    test("handles errors in handleFailure gracefully", async () => {
      const mockEvent: RuntimeEvent = {
        requestId: "error-456",
        event: {
          functionName: "failingFunction",
          params: {},
          context: {
            invocation: { id: "inv-654" },
            session: { id: "session-654", connectUrl: "ws://test" },
          },
        },
      };

      const mockFunctionDef: FunctionManifest<unknown> = {
        name: "failingFunction",
        handler: async () => {
          throw new Error("User error");
        },
        config: {},
      };

      const userError = new Error("Function failed");
      const handleFailureError = new Error("Failed to report failure");

      // Setup mocks
      const waitForNextInvocationMock =
        mockClient.waitForNextInvocation as unknown as ReturnType<
          typeof mock.fn
        >;
      waitForNextInvocationMock.mock.mockImplementationOnce(() =>
        Promise.resolve(mockEvent),
      );

      const getFunctionDefinitionByNameMock =
        mockClient.getFunctionDefinitionByName as unknown as ReturnType<
          typeof mock.fn
        >;
      getFunctionDefinitionByNameMock.mock.mockImplementationOnce(
        () => mockFunctionDef,
      );

      const executeFunctionMock =
        mockClient.executeFunction as unknown as ReturnType<typeof mock.fn>;
      executeFunctionMock.mock.mockImplementationOnce(() =>
        Promise.reject(userError),
      );

      const handleFailureMock =
        mockClient.handleFailure as unknown as ReturnType<typeof mock.fn>;
      handleFailureMock.mock.mockImplementationOnce(() =>
        Promise.reject(handleFailureError),
      );

      // Execute - should handle the error as a system error
      await waitForAndHandleInvocation(
        mockClient,
        handleProductionFailure as unknown as (error: unknown) => void,
      );

      // Assert
      assert.strictEqual(handleFailureMock.mock.callCount(), 1);
      assert.strictEqual(handleProductionFailure.mock.callCount(), 1);
      assert.strictEqual(
        handleProductionFailure.mock.calls[0]?.arguments[0],
        handleFailureError,
      );
    });
  });
});
