import { describe, test } from "node:test";
import assert from "node:assert";
import { EnvironmentManager } from "./env.js";

describe("Environment Manager", () => {
  describe("environment field", () => {
    test("defaults to 'local' when NODE_ENV is not set", () => {
      const env: NodeJS.ProcessEnv = {};
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "local");
    });

    test("returns 'production' when NODE_ENV is set to production", () => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "production");
    });

    test("returns 'local' when NODE_ENV is set to local", () => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: "local" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "local");
    });

    test("returns custom value when NODE_ENV is set to other values", () => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "development");
    });
  });

  describe("runtime api field", () => {
    test("defaults to '127.0.0.1:14113' when AWS_LAMBDA_RUNTIME_API is not set", () => {
      const env: NodeJS.ProcessEnv = {};
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.runtimeApi, "127.0.0.1:14113");
    });

    test("returns custom value when AWS_LAMBDA_RUNTIME_API is set", () => {
      const env: NodeJS.ProcessEnv = {
        AWS_LAMBDA_RUNTIME_API: "lambda.amazonaws.com:443",
      };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.runtimeApi, "lambda.amazonaws.com:443");
    });

    test("handles localhost URLs correctly", () => {
      const env: NodeJS.ProcessEnv = {
        AWS_LAMBDA_RUNTIME_API: "localhost:8080",
      };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.runtimeApi, "localhost:8080");
    });

    test("handles empty string as undefined and uses default", () => {
      const env: NodeJS.ProcessEnv = { AWS_LAMBDA_RUNTIME_API: "" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.runtimeApi, "127.0.0.1:14113");
    });
  });

  describe("phase field", () => {
    test("defaults to 'runtime' when BB_FUNCTIONS_PHASE is not set", () => {
      const env: NodeJS.ProcessEnv = {};
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.phase, "runtime");
    });

    test("returns 'introspect' when BB_FUNCTIONS_PHASE is set to introspect", () => {
      const env: NodeJS.ProcessEnv = { BB_FUNCTIONS_PHASE: "introspect" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.phase, "introspect");
    });

    test("returns 'runtime' when BB_FUNCTIONS_PHASE is set to runtime", () => {
      const env: NodeJS.ProcessEnv = { BB_FUNCTIONS_PHASE: "runtime" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.phase, "runtime");
    });

    test("returns custom value when BB_FUNCTIONS_PHASE is set to other values", () => {
      const env: NodeJS.ProcessEnv = { BB_FUNCTIONS_PHASE: "build" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.phase, "build");
    });

    test("handles empty string as undefined and uses default", () => {
      const env: NodeJS.ProcessEnv = { BB_FUNCTIONS_PHASE: "" };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.phase, "runtime");
    });
  });

  describe("multiple fields together", () => {
    test("all fields use defaults when no env vars are set", () => {
      const env: NodeJS.ProcessEnv = {};
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "local");
      assert.strictEqual(manager.runtimeApi, "127.0.0.1:14113");
      assert.strictEqual(manager.phase, "runtime");
    });

    test("all fields use custom values when env vars are set", () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        AWS_LAMBDA_RUNTIME_API: "api.example.com:443",
        BB_FUNCTIONS_PHASE: "introspect",
      };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "production");
      assert.strictEqual(manager.runtimeApi, "api.example.com:443");
      assert.strictEqual(manager.phase, "introspect");
    });

    test("mixed defaults and custom values", () => {
      const env: NodeJS.ProcessEnv = {
        AWS_LAMBDA_RUNTIME_API: "custom.api:8080",
      };
      const manager = new EnvironmentManager(env);
      assert.strictEqual(manager.environment, "local");
      assert.strictEqual(manager.runtimeApi, "custom.api:8080");
      assert.strictEqual(manager.phase, "runtime");
    });
  });

  describe("immutability", () => {
    test("values are cached from constructor and don't change with env changes", () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "local",
        AWS_LAMBDA_RUNTIME_API: "original.api:9000",
        BB_FUNCTIONS_PHASE: "runtime",
      };

      const manager = new EnvironmentManager(env);

      // Change env object after construction
      env["NODE_ENV"] = "production";
      env["AWS_LAMBDA_RUNTIME_API"] = "new.api:8000";
      env["BB_FUNCTIONS_PHASE"] = "introspect";

      // Values should remain unchanged
      assert.strictEqual(manager.environment, "local");
      assert.strictEqual(manager.runtimeApi, "original.api:9000");
      assert.strictEqual(manager.phase, "runtime");
    });
  });
});
