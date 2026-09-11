import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { FunctionsCoreError } from "./errors.js";
import { createFunctionArchive } from "./archive.js";
import { InvocationBridge } from "./dev.js";
import { createFunctionProject } from "./init.js";
import { invokeFunction } from "./invoke.js";
import { publishFunction } from "./publish.js";
import { parseJsonArgument, resolveFunctionsApiConfig } from "./shared.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Functions core", () => {
  it("throws typed errors instead of exiting for missing credentials", () => {
    assert.throws(
      () => resolveFunctionsApiConfig({ env: {} }),
      (error: unknown) =>
        error instanceof FunctionsCoreError && error.code === "missing_api_key",
    );
  });

  it("parses JSON params without CLI output", () => {
    assert.deepEqual(parseJsonArgument('{"answer":42}', "params"), {
      answer: 42,
    });
    assert.throws(
      () => parseJsonArgument("{", "params"),
      (error: unknown) =>
        error instanceof FunctionsCoreError && error.code === "invalid_json",
    );
  });

  it("creates a canonical scaffold with caller-provided CLI scripts", async () => {
    const cwd = await createTempDir("init");
    const result = await createFunctionProject({
      cwd,
      install: false,
      packageManager: "npm",
      projectName: "demo-function",
      scripts: {
        deploy: "browse functions publish index.ts",
        dev: "browse functions dev index.ts",
      },
    });

    const packageJson = JSON.parse(
      readFileSync(join(result.projectRoot, "package.json"), "utf8"),
    ) as {
      packageManager: string;
      scripts: { deploy: string; dev: string };
      version: string;
    };
    assert.match(packageJson.packageManager, /^npm@/);
    assert.equal(packageJson.version, "1.0.0");
    assert.equal(packageJson.scripts.dev, "browse functions dev index.ts");
    assert.ok(existsSync(join(result.projectRoot, "index.ts")));
    if (process.platform !== "win32") {
      assert.equal(
        statSync(join(result.projectRoot, ".env")).mode & 0o777,
        0o600,
      );
    }
  });

  it("does not follow symlinks or run lifecycle scripts while archiving", async () => {
    const cwd = await createTempDir("safe-archive");
    const outside = await createTempDir("outside");
    const secretPath = join(outside, "secret.txt");
    const markerPath = join(outside, "preinstall-ran");
    writeFileSync(secretPath, "secret\n");
    symlinkSync(secretPath, join(cwd, "linked-secret.txt"));
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        name: "fixture",
        scripts: {
          preinstall: `node -e ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran')`)}`,
        },
        version: "1.0.0",
      }),
    );
    writeFileSync(join(cwd, "index.ts"), "export {};\n");

    const archive = await createFunctionArchive(cwd);

    assert.ok(archive.entries.includes("package-lock.json"));
    assert.ok(!archive.entries.includes("linked-secret.txt"));
    assert.equal(existsSync(markerPath), false);
  });

  it("rejects entrypoints outside or excluded from the publish archive", async () => {
    const cwd = await createTempDir("entrypoint-project");
    const outside = await createTempDir("entrypoint-outside");
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0" }),
    );
    writeFileSync(join(cwd, "index.ts"), "export {};\n");
    writeFileSync(join(outside, "outside.ts"), "export {};\n");

    await assert.rejects(
      publishFunction({
        apiKey: "test",
        cwd,
        dryRun: true,
        entrypoint: join(outside, "outside.ts"),
      }),
      (error: unknown) =>
        error instanceof FunctionsCoreError &&
        error.code === "invalid_entrypoint",
    );

    writeFileSync(join(cwd, ".gitignore"), "index.ts\n");
    await assert.rejects(
      publishFunction({
        apiKey: "test",
        cwd,
        dryRun: true,
        entrypoint: "index.ts",
      }),
      (error: unknown) =>
        error instanceof FunctionsCoreError &&
        error.code === "invalid_entrypoint",
    );
  });

  it("forgets a runtime next connection when the client disconnects", () => {
    const bridge = new InvocationBridge();
    const response = new EventEmitter() as EventEmitter & ServerResponse;
    bridge.holdNextConnection(response, {});
    assert.equal(bridge.isRuntimeConnected(), true);

    response.emit("close");

    assert.equal(bridge.isRuntimeConnected(), false);
  });

  it("publishes and polls through the injected transport", async () => {
    const cwd = await createTempDir("publish");
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0" }),
    );
    writeFileSync(join(cwd, "index.ts"), "export {};\n");
    const requests: Array<{ method: string; url: string }> = [];
    let buildPolls = 0;
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ method: init?.method ?? "GET", url });
      if (url.endsWith("/v1/functions/builds") && init?.method === "POST") {
        return Response.json({ id: "build_123" });
      }
      buildPolls += 1;
      return Response.json({
        id: "build_123",
        status: buildPolls === 1 ? "RUNNING" : "COMPLETED",
        builtFunctions: [{ id: "fn_123", name: "fixture" }],
      });
    };

    const result = await publishFunction({
      apiKey: "test-key",
      baseUrl: "https://functions.test",
      cwd,
      entrypoint: "index.ts",
      fetch: fetchImplementation,
      pollIntervalMs: 0,
    });

    assert.equal(result.dryRun, false);
    assert.equal(result.dryRun ? "" : result.build.status, "COMPLETED");
    assert.deepEqual(
      requests.map((request) => request.method),
      ["POST", "GET", "GET"],
    );
  });

  it("invokes and returns the final typed result", async () => {
    let request = 0;
    const fetchImplementation: typeof fetch = async () => {
      request += 1;
      if (request === 1) {
        return Response.json({
          functionId: "fn_123",
          id: "inv_123",
          status: "PENDING",
        });
      }
      return Response.json({
        functionId: "fn_123",
        id: "inv_123",
        results: { ok: true },
        status: "COMPLETED",
      });
    };

    const result = await invokeFunction({
      apiKey: "test-key",
      baseUrl: "https://functions.test",
      fetch: fetchImplementation,
      functionId: "fn_123",
      params: { hello: "world" },
      pollIntervalMs: 0,
    });
    assert.equal(result.status, "COMPLETED");
    assert.deepEqual(result.results, { ok: true });
  });
});

async function createTempDir(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `functions-core-${label}-`));
  tempDirs.push(dir);
  return dir;
}
