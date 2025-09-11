import { describe, test } from "node:test";
import assert from "node:assert";
import z from "zod";

import {
  buildPersistedFunctionManifest,
  buildPersistedJsonSchema,
} from "./helpers.js";

import type { FunctionManifest } from "../types/definition.js";

describe("buildPersistedFunctionManifest", () => {
  test("builds persisted manifest without parameters schema", () => {
    const manifest: FunctionManifest<undefined> = {
      name: "testFunction",
      handler: async () => ({ success: true }),
      config: {
        sessionConfig: {
          browserSettings: {
            viewport: { width: 1920, height: 1080 },
          },
        },
      },
    };

    const result = buildPersistedFunctionManifest(manifest);

    assert.strictEqual(result.name, "testFunction");
    assert.deepStrictEqual(result.config.sessionConfig, {
      browserSettings: {
        viewport: { width: 1920, height: 1080 },
      },
    });
    assert.strictEqual(result.config.parametersSchema, undefined);
  });

  test("builds persisted manifest with Zod schema", () => {
    const schema = z.object({
      url: z.string(),
      timeout: z.number().optional(),
    });

    const manifest: FunctionManifest<typeof schema> = {
      name: "fetchFunction",
      handler: async () => ({ success: true }),
      config: {
        parametersSchema: schema,
      },
    };

    const result = buildPersistedFunctionManifest(manifest);

    assert.strictEqual(result.name, "fetchFunction");
    assert(result.config.parametersSchema);
    assert(typeof result.config.parametersSchema === "object");
    assert("type" in result.config.parametersSchema);
    assert("properties" in result.config.parametersSchema);
  });

  test("builds persisted manifest with both schema and session config", () => {
    const schema = z.object({
      query: z.string(),
    });

    const manifest: FunctionManifest<typeof schema> = {
      name: "searchFunction",
      handler: async () => ({ success: true }),
      config: {
        parametersSchema: schema,
        sessionConfig: {
          browserSettings: {
            fingerprint: { devices: ["desktop"] },
          },
        },
      },
    };

    const result = buildPersistedFunctionManifest(manifest);

    assert.strictEqual(result.name, "searchFunction");
    assert(result.config.parametersSchema);
    assert.deepStrictEqual(result.config.sessionConfig, {
      browserSettings: {
        fingerprint: { devices: ["desktop"] },
      },
    });
  });

  test("builds persisted manifest with empty config", () => {
    const manifest: FunctionManifest<undefined> = {
      name: "simpleFunction",
      handler: async () => ({ success: true }),
      config: {},
    };

    const result = buildPersistedFunctionManifest(manifest);

    assert.strictEqual(result.name, "simpleFunction");
    assert.deepStrictEqual(result.config, {});
  });
});

describe("buildPersistedJsonSchema", () => {
  test("converts Zod object to JSON schema", () => {
    const zodSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = buildPersistedJsonSchema(zodSchema);

    assert(typeof result === "object");
    assert("type" in result);
    assert("properties" in result);
  });

  test("returns empty object for non-Zod input", () => {
    const plainObject = { type: "object", properties: {} };

    const result = buildPersistedJsonSchema(
      plainObject as unknown as z.ZodObject<z.ZodRawShape>,
    );

    assert.deepStrictEqual(result, {});
  });

  test("returns empty object for undefined input", () => {
    const result = buildPersistedJsonSchema(
      undefined as unknown as z.ZodObject<z.ZodRawShape>,
    );

    assert.deepStrictEqual(result, {});
  });
});
