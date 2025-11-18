import { describe, test } from "node:test";
import assert from "node:assert";
import { FunctionRegistry } from "./registry.js";
import { FunctionNotFoundInRegistryError } from "../utils/errors.js";
import type { FunctionInvocationContext } from "../schemas/invocation.js";
import { z } from "zod";
import type { FunctionConfiguration } from "../types/definition.js";
import type { FunctionHandler } from "../types/handler.js";

const defaultMockContext: FunctionInvocationContext = {
  invocation: {
    id: "inv-123",
  },
  session: {
    id: "session-456",
    connectUrl: "https://example.com/connect",
  },
};

describe("FunctionRegistry", () => {
  describe("register", () => {
    test("registers a function with name, handler, and config", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "test" });
      const config: FunctionConfiguration<unknown> = {};

      registry.register("testFunction", handler, config);

      assert.strictEqual(registry.size, 1);
      const registered = registry.getByName("testFunction");
      assert.notStrictEqual(registered, null);
      assert.strictEqual(registered?.name, "testFunction");
      assert.strictEqual(registered?.handler, handler);
      assert.deepStrictEqual(registered?.config, config);
    });

    test("registers multiple functions", () => {
      const registry = new FunctionRegistry();
      const handler1 = async () => ({ result: "test1" });
      const handler2 = async () => ({ result: "test2" });
      const handler3 = async () => ({ result: "test3" });

      registry.register("function1", handler1, {});
      registry.register("function2", handler2, {});
      registry.register("function3", handler3, {});

      assert.strictEqual(registry.size, 3);
      assert.notStrictEqual(registry.getByName("function1"), null);
      assert.notStrictEqual(registry.getByName("function2"), null);
      assert.notStrictEqual(registry.getByName("function3"), null);
    });

    test("overwrites existing function with same name", () => {
      const registry = new FunctionRegistry();
      const handler1 = async () => ({ result: "original" });
      const handler2 = async () => ({ result: "updated" });
      const schema1 = z.object({ value: z.string() });
      const schema2 = z.object({ value: z.number() });

      registry.register("testFunction", handler1, {
        parametersSchema: schema1,
      });
      registry.register("testFunction", handler2, {
        parametersSchema: schema2,
      });

      assert.strictEqual(registry.size, 1);
      const registered = registry.getByName("testFunction");
      assert.strictEqual(registered?.handler, handler2);
      assert.strictEqual(registered?.config.parametersSchema, schema2);
    });

    test("registers function with typed schema", () => {
      const registry = new FunctionRegistry();
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const handler: FunctionHandler<typeof schema> = async (_ctx, params) => ({
        greeting: `Hello ${params.name}, age ${params.age}`,
      });

      registry.register("typedFunction", handler, {
        parametersSchema: schema,
      });

      const registered = registry.getByName("typedFunction");
      assert.notStrictEqual(registered, null);
      assert.strictEqual(registered?.config.parametersSchema, schema);
    });

    test("registers function with session config", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "test" });
      const config: FunctionConfiguration<unknown> = {
        sessionConfig: {
          browserSettings: {
            viewport: {
              width: 1920,
              height: 1080,
            },
          },
        },
      };

      registry.register("configuredFunction", handler, config);

      const registered = registry.getByName("configuredFunction");
      assert.notStrictEqual(registered, null);
      assert.deepStrictEqual(
        registered?.config.sessionConfig,
        config.sessionConfig,
      );
    });

    test("registers function with both parametersSchema and sessionConfig", () => {
      const registry = new FunctionRegistry();
      const schema = z.object({ input: z.string() });
      const handler: FunctionHandler<typeof schema> = async (_ctx, params) => ({
        output: params.input.toUpperCase(),
      });
      const config: FunctionConfiguration<typeof schema> = {
        parametersSchema: schema,
        sessionConfig: {
          keepAlive: true,
        },
      };

      registry.register("fullConfigFunction", handler, config);

      const registered = registry.getByName("fullConfigFunction");
      assert.notStrictEqual(registered, null);
      assert.strictEqual(registered?.config.parametersSchema, schema);
      assert.deepStrictEqual(registered?.config.sessionConfig, {
        keepAlive: true,
      });
    });
  });

  describe("getByName", () => {
    test("returns registered function", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "test" });
      registry.register("testFunction", handler, {});

      const result = registry.getByName("testFunction");
      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.name, "testFunction");
      assert.strictEqual(result?.handler, handler);
    });

    test("returns null for non-existent function", () => {
      const registry = new FunctionRegistry();
      const result = registry.getByName("nonExistent");
      assert.strictEqual(result, null);
    });

    test("returns null for empty registry", () => {
      const registry = new FunctionRegistry();
      const result = registry.getByName("anyFunction");
      assert.strictEqual(result, null);
    });

    test("handles case-sensitive function names", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "test" });
      registry.register("TestFunction", handler, {});

      assert.notStrictEqual(registry.getByName("TestFunction"), null);
      assert.strictEqual(registry.getByName("testfunction"), null);
      assert.strictEqual(registry.getByName("testFunction"), null);
      assert.strictEqual(registry.getByName("TESTFUNCTION"), null);
    });
  });

  describe("execute", () => {
    test("executes registered function with params and context", async () => {
      const registry = new FunctionRegistry();
      const schema = z.object({ value: z.number() });
      const handler: FunctionHandler<typeof schema> = async (
        context,
        params,
      ) => ({
        doubledValue: params.value * 2,
        invocationId: context.invocation.id,
      });

      registry.register("doubleFunction", handler, {
        parametersSchema: schema,
      });

      const result = await registry.execute(
        "doubleFunction",
        { value: 5 },
        defaultMockContext,
      );

      assert.deepStrictEqual(result, {
        doubledValue: 10,
        invocationId: "inv-123",
      });
    });

    test("executes function that returns void", async () => {
      const registry = new FunctionRegistry();
      let sideEffect = 0;
      const schema = z.object({ increment: z.number() });
      const handler: FunctionHandler<typeof schema> = async (_ctx, params) => {
        sideEffect += params.increment;
      };

      registry.register("voidFunction", handler, {
        parametersSchema: schema,
      });

      const result = await registry.execute(
        "voidFunction",
        { increment: 5 },
        defaultMockContext,
      );

      assert.strictEqual(result, undefined);
      assert.strictEqual(sideEffect, 5);
    });

    test("executes synchronous handler", async () => {
      const registry = new FunctionRegistry();
      const schema = z.object({ value: z.string() });
      const handler: FunctionHandler<typeof schema> = (_ctx, params) => ({
        uppercased: params.value.toUpperCase(),
      });

      registry.register("syncFunction", handler, {
        parametersSchema: schema,
      });

      const result = await registry.execute(
        "syncFunction",
        { value: "hello" },
        defaultMockContext,
      );

      assert.deepStrictEqual(result, {
        uppercased: "HELLO",
      });
    });

    test("throws FunctionNotFoundInRegistryError for non-existent function", async () => {
      const registry = new FunctionRegistry();
      await assert.rejects(
        async () => {
          await registry.execute("nonExistent", {}, defaultMockContext);
        },
        (error) => {
          assert(error instanceof FunctionNotFoundInRegistryError);
          assert.strictEqual(
            error.message,
            'Couldn\'t find function with name "nonExistent" in registry',
          );
          return true;
        },
      );
    });

    test("passes context correctly to handler", async () => {
      const registry = new FunctionRegistry();
      let capturedContext: FunctionInvocationContext | null = null;
      const handler: FunctionHandler<unknown> = async (context) => {
        capturedContext = context;
        return { success: true };
      };

      registry.register("contextTest", handler, {});

      await registry.execute("contextTest", {}, defaultMockContext);

      assert.deepStrictEqual(capturedContext, defaultMockContext);
    });

    test("handles handler that throws an error", async () => {
      const registry = new FunctionRegistry();
      const handler: FunctionHandler<unknown> = async () => {
        throw new Error("Handler error");
      };

      registry.register("errorFunction", handler, {});

      await assert.rejects(
        async () => {
          await registry.execute("errorFunction", {}, defaultMockContext);
        },
        (error) => {
          assert(error instanceof Error);
          assert.strictEqual(error.message, "Handler error");
          return true;
        },
      );
    });

    test("handles complex nested return values", async () => {
      const registry = new FunctionRegistry();
      const handler: FunctionHandler<unknown> = async () => ({
        nested: {
          deeply: {
            value: "test",
            array: [1, 2, 3],
            boolean: true,
          },
        },
        timestamp: Date.now(),
      });

      registry.register("complexFunction", handler, {});

      const result = (await registry.execute(
        "complexFunction",
        {},
        defaultMockContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      )) as any;

      assert.strictEqual(typeof result, "object");
      assert.strictEqual(result?.nested?.deeply?.value, "test");
      assert.deepStrictEqual(result?.nested?.deeply?.array, [1, 2, 3]);
      assert.strictEqual(result?.nested?.deeply?.boolean, true);
      assert.strictEqual(typeof result?.timestamp, "number");
    });

    test("executes function with empty params object", async () => {
      const registry = new FunctionRegistry();
      const schema = z.object({});
      const handler: FunctionHandler<typeof schema> = async () => ({
        message: "No params needed",
      });

      registry.register("noParamsFunction", handler, {
        parametersSchema: schema,
      });

      const result = await registry.execute(
        "noParamsFunction",
        {},
        defaultMockContext,
      );

      assert.deepStrictEqual(result, {
        message: "No params needed",
      });
    });

    test("executes function with complex params", async () => {
      const registry = new FunctionRegistry();
      const schema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
        settings: z.object({
          theme: z.string(),
          notifications: z.boolean(),
        }),
      });
      const handler: FunctionHandler<typeof schema> = async (_ctx, params) => ({
        summary: `${params.user.name} (${params.user.age}) - Theme: ${params.settings.theme}`,
      });

      registry.register("complexParamsFunction", handler, {
        parametersSchema: schema,
      });

      const result = await registry.execute(
        "complexParamsFunction",
        {
          user: { name: "Alice", age: 30 },
          settings: { theme: "dark", notifications: true },
        },
        defaultMockContext,
      );

      assert.deepStrictEqual(result, {
        summary: "Alice (30) - Theme: dark",
      });
    });
  });

  describe("size getter", () => {
    test("returns 0 for empty registry", () => {
      const registry = new FunctionRegistry();
      assert.strictEqual(registry.size, 0);
    });

    test("returns correct count after registrations", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({});

      registry.register("func1", handler, {});
      assert.strictEqual(registry.size, 1);

      registry.register("func2", handler, {});
      assert.strictEqual(registry.size, 2);

      registry.register("func3", handler, {});
      assert.strictEqual(registry.size, 3);
    });

    test("doesn't increase when overwriting existing function", () => {
      const registry = new FunctionRegistry();
      const handler1 = async () => ({ v: 1 });
      const handler2 = async () => ({ v: 2 });

      registry.register("func", handler1, {});
      assert.strictEqual(registry.size, 1);

      registry.register("func", handler2, {});
      assert.strictEqual(registry.size, 1);
    });
  });

  describe("multiple registries", () => {
    test("registries are independent", () => {
      const registry1 = new FunctionRegistry();
      const registry2 = new FunctionRegistry();

      const handler1 = async () => ({ source: "registry1" });
      const handler2 = async () => ({ source: "registry2" });

      registry1.register("func", handler1, {});
      registry2.register("func", handler2, {});

      assert.strictEqual(registry1.size, 1);
      assert.strictEqual(registry2.size, 1);

      const result1 = registry1.getByName("func");
      const result2 = registry2.getByName("func");

      assert.notStrictEqual(result1, result2);
      assert.strictEqual(result1?.handler, handler1);
      assert.strictEqual(result2?.handler, handler2);
    });
  });

  describe("edge cases", () => {
    test("handles special characters in function names", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "special" });

      registry.register("func-with-dash", handler, {});
      registry.register("func_with_underscore", handler, {});
      registry.register("func.with.dots", handler, {});
      registry.register("func@with@at", handler, {});

      assert.notStrictEqual(registry.getByName("func-with-dash"), null);
      assert.notStrictEqual(registry.getByName("func_with_underscore"), null);
      assert.notStrictEqual(registry.getByName("func.with.dots"), null);
      assert.notStrictEqual(registry.getByName("func@with@at"), null);
      assert.strictEqual(registry.size, 4);
    });

    test("handles empty string as function name", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "empty" });

      registry.register("", handler, {});

      assert.strictEqual(registry.size, 1);
      assert.notStrictEqual(registry.getByName(""), null);
    });

    test("handles unicode characters in function names", () => {
      const registry = new FunctionRegistry();
      const handler = async () => ({ result: "unicode" });

      registry.register("函数", handler, {});
      registry.register("función", handler, {});
      registry.register("λ", handler, {});

      assert.notStrictEqual(registry.getByName("函数"), null);
      assert.notStrictEqual(registry.getByName("función"), null);
      assert.notStrictEqual(registry.getByName("λ"), null);
      assert.strictEqual(registry.size, 3);
    });

    test("handles very long function names", () => {
      const registry = new FunctionRegistry();
      const longName = "a".repeat(1000);
      const handler = async () => ({ result: "long" });

      registry.register(longName, handler, {});

      assert.strictEqual(registry.size, 1);
      assert.notStrictEqual(registry.getByName(longName), null);
    });
  });
});
