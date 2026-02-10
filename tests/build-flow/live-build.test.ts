import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");

const API_KEY = process.env["BROWSERBASE_API_KEY"];
const PROJECT_ID = process.env["BROWSERBASE_PROJECT_ID"];
const API_URL =
  process.env["BROWSERBASE_API_URL"] ?? "https://api.browserbase.com";

function requireCredentials(): void {
  if (!API_KEY || !PROJECT_ID) {
    throw new Error(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set for live build tests",
    );
  }
}

function bbApi(
  method: string,
  path: string,
  body?: unknown,
): { status: number; data: unknown } {
  const args = [
    "curl",
    "-s",
    "-w",
    "\\n%{http_code}",
    "-X",
    method,
    `${API_URL}${path}`,
    "-H",
    `x-bb-api-key: ${API_KEY}`,
    "-H",
    "Content-Type: application/json",
  ];
  if (body) {
    args.push("-d", JSON.stringify(body));
  }

  const output = execSync(args.join(" "), {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lines = String(output).trim().split("\n");
  const statusCode = parseInt(lines.pop()!, 10);
  const responseBody = lines.join("\n");

  let data: unknown;
  try {
    data = JSON.parse(responseBody);
  } catch {
    data = responseBody;
  }

  return { status: statusCode, data };
}

function pollBuildStatus(
  buildId: string,
  timeoutMs: number = 120_000,
): unknown {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = bbApi("GET", `/v1/functions/builds/${buildId}`);
    const build = res.data as Record<string, unknown>;

    if (build["status"] === "COMPLETED") {
      return build;
    }
    if (build["status"] === "FAILED") {
      throw new Error(`Build ${buildId} failed: ${JSON.stringify(build)}`);
    }

    execSync("sleep 3");
  }
  throw new Error(`Build ${buildId} did not complete within ${timeoutMs}ms`);
}

let tarballPath: string;
const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `bb-live-build-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

describe("Live Build + Invoke", () => {
  before(() => {
    // Pack the SDK (build is assumed to have been done by the npm script)
    const packOutput = execSync("pnpm pack", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const tarballName = String(packOutput).trim().split("\n").pop()!.trim();
    tarballPath = join(PROJECT_ROOT, tarballName);
    assert.ok(existsSync(tarballPath), `Tarball not found at ${tarballPath}`);
  });

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (tarballPath && existsSync(tarballPath)) {
      rmSync(tarballPath);
    }
  });

  it("publishes basic function, builds, and invokes successfully", () => {
    requireCredentials();

    // Create a temp project that installs the SDK from the tarball
    const dir = createTempDir("basic");

    const pkg = {
      name: "live-build-test",
      version: "1.0.0",
      private: true,
      type: "module",
    };
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));

    writeFileSync(
      join(dir, "index.mjs"),
      `import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("basic", async () => {
  return { answer: "adam is cool" };
});
`,
    );

    // Install the SDK from the tarball
    execSync(`npm install ${tarballPath}`, {
      cwd: dir,
      stdio: "pipe",
      env: {
        ...process.env,
        npm_config_fund: "false",
        npm_config_audit: "false",
      },
    });

    // Publish from the temp project
    const publishOutput = execSync("npx bb publish index.mjs", {
      cwd: dir,
      encoding: "utf-8",
      env: {
        ...process.env,
        BROWSERBASE_API_KEY: API_KEY,
        BROWSERBASE_PROJECT_ID: PROJECT_ID,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Extract build ID from stdout
    const buildIdMatch = String(publishOutput).match(
      /Build ID:\s*([a-f0-9-]+)/i,
    );
    assert.ok(
      buildIdMatch,
      `Could not find build ID in output: ${publishOutput}`,
    );
    const buildId = buildIdMatch[1]!;

    // Poll until build completes
    const build = pollBuildStatus(buildId) as Record<string, unknown>;

    // Assert builtFunctions is non-empty
    const builtFunctions = build["builtFunctions"] as Array<
      Record<string, unknown>
    >;
    assert.ok(
      builtFunctions && builtFunctions.length > 0,
      `Expected non-empty builtFunctions, got: ${JSON.stringify(builtFunctions)}`,
    );

    // Find the "basic" function
    const basicFn = builtFunctions.find((f) => f["name"] === "basic");
    assert.ok(basicFn, `Expected a function named "basic" in builtFunctions`);

    // Invoke the built function
    const functionId = basicFn["id"] as string;
    assert.ok(functionId, "Function should have an id");

    const invokeRes = bbApi("POST", `/v1/functions/${functionId}/invoke`, {});
    assert.ok(
      invokeRes.status === 200 || invokeRes.status === 201,
      `Invoke should succeed, got status ${invokeRes.status}: ${JSON.stringify(invokeRes.data)}`,
    );
  });
});
