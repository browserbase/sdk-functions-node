import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  discoverTemplates,
  getTarballPath,
  setupTemplateProject,
  cleanupDir,
  findAvailablePort,
  httpGet,
  httpPost,
  waitForHealthcheck,
  waitForFunctionRegistration,
} from "../helpers.js";

const templates = discoverTemplates();
const API_KEY = "test_key";
const PROJECT_ID = "test_project";

function getFunctionName(templateName: string): string {
  return `sdk-e2e-${templateName}`;
}

function startDevServer(
  entrypoint: string,
  port: number,
  cwd: string,
): ChildProcess {
  const child = spawn(
    "npx",
    ["bb", "dev", entrypoint, "--port", String(port)],
    {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        BROWSERBASE_API_KEY: API_KEY,
        BROWSERBASE_PROJECT_ID: PROJECT_ID,
      },
    },
  );
  return child;
}

function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    proc.on("exit", () => resolve());
    proc.kill("SIGTERM");

    // Force kill after 2 seconds
    setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    }, 2000);
  });
}

const tarballPath = getTarballPath();

describe("Dev Server", () => {
  for (const template of templates) {
    describe(template.name, () => {
      let proc: ChildProcess | null = null;
      let port: number;
      let baseUrl: string;
      let projectDir: string;
      const funcName = getFunctionName(template.name);

      before(() => {
        projectDir = setupTemplateProject(template, tarballPath);
      });

      after(async () => {
        if (proc) {
          await killProcess(proc);
          proc = null;
        }
        cleanupDir(projectDir);
      });

      it("starts, passes healthcheck, and responds to invocation", async () => {
        port = await findAvailablePort();
        baseUrl = `http://127.0.0.1:${port}`;

        // Start server
        proc = startDevServer(template.entrypoint, port, projectDir);

        // Collect logs for diagnostics
        let serverLogs = "";
        proc.stdout?.on("data", (chunk: Buffer) => {
          serverLogs += chunk.toString();
        });
        proc.stderr?.on("data", (chunk: Buffer) => {
          serverLogs += chunk.toString();
        });

        // Wait for healthcheck
        try {
          await waitForHealthcheck(baseUrl, 30_000);
        } catch {
          assert.fail(
            `Server failed to start within 30s.\nLogs:\n${serverLogs}`,
          );
        }

        // Verify healthcheck response
        const healthRes = await httpGet(`${baseUrl}/`);
        assert.equal(healthRes.statusCode, 200);
        assert.ok(healthRes.body.includes('"ok":true'));

        // Wait for function registration
        try {
          await waitForFunctionRegistration(baseUrl, funcName, API_KEY, 15_000);
        } catch {
          assert.fail(
            `Function '${funcName}' not registered within 15s.\nLogs:\n${serverLogs}`,
          );
        }

        // Invoke the function
        const invokeRes = await httpPost(
          `${baseUrl}/v1/functions/${funcName}/invoke`,
          { params: {} },
          { "x-bb-api-key": API_KEY },
        );

        assert.notEqual(
          invokeRes.statusCode,
          404,
          `Function '${funcName}' should be registered.\nBody: ${invokeRes.body}\nLogs:\n${serverLogs}`,
        );
      });

      it("returns 404 for nonexistent function", async () => {
        // This test relies on the server still running from the previous test.
        // If the server is not running, start it fresh.
        if (!proc || proc.exitCode !== null) {
          port = await findAvailablePort();
          baseUrl = `http://127.0.0.1:${port}`;
          proc = startDevServer(template.entrypoint, port, projectDir);

          await waitForHealthcheck(baseUrl, 30_000);
          await waitForFunctionRegistration(baseUrl, funcName, API_KEY, 15_000);
        }

        const res = await httpPost(
          `${baseUrl}/v1/functions/nonexistent/invoke`,
          { params: {} },
          { "x-bb-api-key": API_KEY },
        );

        assert.equal(
          res.statusCode,
          404,
          `Expected 404 for nonexistent function, got ${res.statusCode}`,
        );
      });
    });
  }
});
