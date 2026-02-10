import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Resolve the project root (3 levels up from dist-integration-test/tests/build-flow/)
const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");

let tarballPath: string;
const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `bb-build-test-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

function setupTempProject(
  dir: string,
  opts: {
    type?: "module" | "commonjs";
    files: Record<string, string>;
    extraDeps?: string[];
  },
): void {
  const pkg: Record<string, unknown> = {
    name: "test-project",
    version: "1.0.0",
    private: true,
  };
  if (opts.type) {
    pkg["type"] = opts.type;
  }

  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  for (const [filename, content] of Object.entries(opts.files)) {
    const filePath = join(dir, filename);
    const fileDir = join(filePath, "..");
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }
    writeFileSync(filePath, content);
  }

  // Install the tarball + any extra deps
  const deps = [tarballPath, ...(opts.extraDeps ?? [])].join(" ");
  execSync(`npm install ${deps}`, {
    cwd: dir,
    stdio: "pipe",
    env: {
      ...process.env,
      npm_config_fund: "false",
      npm_config_audit: "false",
    },
  });
}

describe("Build Flow", () => {
  before(() => {
    // Pack the SDK (build is assumed to have been done by the npm script)
    const packOutput = execSync("pnpm pack", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // pnpm pack outputs the tarball filename
    const tarballName = String(packOutput).trim().split("\n").pop()!.trim();
    tarballPath = join(PROJECT_ROOT, tarballName);
    assert.ok(existsSync(tarballPath), `Tarball not found at ${tarballPath}`);
  });

  after(() => {
    // Clean up temp directories
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    // Clean up tarball
    if (tarballPath && existsSync(tarballPath)) {
      rmSync(tarballPath);
    }
  });

  it("ESM import works", () => {
    const dir = createTempDir("esm");
    setupTempProject(dir, {
      type: "module",
      files: {
        "index.mjs": `
import { defineFn } from "@browserbasehq/sdk-functions";
if (typeof defineFn !== "function") {
  process.exit(1);
}
console.log("ESM_OK");
`,
      },
    });

    const output = execSync("node index.mjs", {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok(String(output).includes("ESM_OK"), "ESM import should work");
  });

  it("CJS require works", () => {
    const dir = createTempDir("cjs");
    setupTempProject(dir, {
      files: {
        "index.cjs": `
const sdk = require("@browserbasehq/sdk-functions");
if (typeof sdk.defineFn !== "function") {
  process.exit(1);
}
console.log("CJS_OK");
`,
      },
    });

    const output = execSync("node index.cjs", {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok(String(output).includes("CJS_OK"), "CJS require should work");
  });

  it("TypeScript declarations are present", () => {
    const dir = createTempDir("dts");
    setupTempProject(dir, {
      files: {
        "check.mjs": `console.log("OK");`,
      },
    });

    const dtsPath = join(
      dir,
      "node_modules",
      "@browserbasehq",
      "sdk-functions",
      "dist",
      "index.d.ts",
    );
    const dctsPath = join(
      dir,
      "node_modules",
      "@browserbasehq",
      "sdk-functions",
      "dist",
      "index.d.cts",
    );

    assert.ok(existsSync(dtsPath), `.d.ts should exist at ${dtsPath}`);
    assert.ok(existsSync(dctsPath), `.d.cts should exist at ${dctsPath}`);
  });

  it("bb CLI binary works", () => {
    const dir = createTempDir("cli");
    setupTempProject(dir, {
      type: "module",
      files: {
        "placeholder.mjs": `console.log("OK");`,
      },
    });

    const output = execSync("npx bb --version", {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok(
      String(output).trim().length > 0,
      "bb --version should produce output",
    );
  });

  it("basic function: introspect works from installed package", () => {
    const dir = createTempDir("introspect-basic");
    setupTempProject(dir, {
      type: "module",
      files: {
        "index.mjs": `
import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("test-basic", async () => {
  return { answer: "hello" };
});
`,
      },
    });

    execSync("node index.mjs", {
      cwd: dir,
      env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
      stdio: "pipe",
    });

    const manifestPath = join(
      dir,
      ".browserbase",
      "functions",
      "manifests",
      "test-basic.json",
    );
    assert.ok(existsSync(manifestPath), "Manifest should be generated");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.name, "test-basic");
    assert.deepStrictEqual(manifest.config, {});
  });

  it("function with Zod schema: introspect works from installed package", () => {
    const dir = createTempDir("introspect-zod");
    setupTempProject(dir, {
      type: "module",
      extraDeps: ["zod"],
      files: {
        "index.mjs": `
import { defineFn } from "@browserbasehq/sdk-functions";
import z from "zod";

defineFn("test-zod", async (_ctx, params) => {
  return { value: params.data * 2 };
}, {
  parametersSchema: z.object({ data: z.number() }),
});
`,
      },
    });

    execSync("node index.mjs", {
      cwd: dir,
      env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
      stdio: "pipe",
    });

    const manifestPath = join(
      dir,
      ".browserbase",
      "functions",
      "manifests",
      "test-zod.json",
    );
    assert.ok(existsSync(manifestPath), "Manifest should be generated");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.name, "test-zod");

    const schema = manifest.config.parametersSchema;
    assert.ok(schema, "parametersSchema should exist");
    assert.equal(schema.type, "object");
    assert.equal(schema.properties.data.type, "number");
    assert.deepStrictEqual(schema.required, ["data"]);
  });

  it("function with session config: introspect works from installed package", () => {
    const dir = createTempDir("introspect-session");
    setupTempProject(dir, {
      type: "module",
      files: {
        "index.mjs": `
import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("test-session", async (context) => {
  return { sessionId: context.session.id };
}, {
  sessionConfig: {
    browserSettings: { advancedStealth: true },
  },
});
`,
      },
    });

    execSync("node index.mjs", {
      cwd: dir,
      env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
      stdio: "pipe",
    });

    const manifestPath = join(
      dir,
      ".browserbase",
      "functions",
      "manifests",
      "test-session.json",
    );
    assert.ok(existsSync(manifestPath), "Manifest should be generated");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.name, "test-session");
    assert.equal(
      manifest.config.sessionConfig.browserSettings.advancedStealth,
      true,
    );
  });
});
