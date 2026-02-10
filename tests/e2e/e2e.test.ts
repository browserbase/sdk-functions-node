import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync, execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { join, basename } from "node:path";

import {
  requireCredentials,
  pollBuildStatus,
  API_KEY,
  PROJECT_ID,
  discoverTemplates,
  getTarballPath,
  setupTemplateProject,
  cleanupDir,
} from "./helpers.js";
import type { Template } from "./helpers.js";

const templates: Template[] = discoverTemplates();
const tarballPath = getTarballPath();
const tarballName = basename(tarballPath);

describe("E2E: Publish, Build, and Invoke", { concurrency: true }, () => {
  before(() => {
    requireCredentials();
  });

  for (const template of templates) {
    describe(template.name, () => {
      let projectDir: string;

      before(() => {
        projectDir = setupTemplateProject(template, tarballPath);

        // Copy the tarball into the project dir so it gets archived
        // on publish, then re-install with pnpm using a relative path
        // so the lockfile references ./<tarball> instead of an absolute path.
        copyFileSync(tarballPath, join(projectDir, tarballName));
        execSync(`pnpm add ./${tarballName}`, {
          cwd: projectDir,
          stdio: "pipe",
          env: {
            ...process.env,
            npm_config_fund: "false",
            npm_config_audit: "false",
          },
        });
      });

      after(() => {
        if (projectDir) {
          cleanupDir(projectDir);
        }
      });

      it("publishes, builds, and invokes successfully", () => {
        // 1. Publish from the temp project
        const publishOutput = execSync(
          `npx bb publish ${template.entrypoint}`,
          {
            cwd: projectDir,
            encoding: "utf-8",
            env: {
              ...process.env,
              BROWSERBASE_API_KEY: API_KEY,
              BROWSERBASE_PROJECT_ID: PROJECT_ID,
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        // 2. Extract build ID from publish stdout
        const buildIdMatch = String(publishOutput).match(
          /Build ID:\s*([a-f0-9-]+)/i,
        );
        assert.ok(
          buildIdMatch,
          `Could not find build ID in output: ${publishOutput}`,
        );
        const buildId = buildIdMatch[1]!;

        // 3. Poll until build completes
        const build = pollBuildStatus(buildId) as Record<string, unknown>;

        // 4. Assert builtFunctions contains the template's function
        const builtFunctions = build["builtFunctions"] as Array<
          Record<string, unknown>
        >;
        assert.ok(
          builtFunctions && builtFunctions.length > 0,
          `Expected non-empty builtFunctions, got: ${JSON.stringify(builtFunctions)}`,
        );

        const expectedName = `sdk-e2e-${template.name}`;
        const builtFn = builtFunctions.find((f) => f["name"] === expectedName);
        assert.ok(
          builtFn,
          `Expected a function named "${expectedName}" in builtFunctions`,
        );

        // 5. Invoke the built function using the CLI
        const functionId = builtFn["id"] as string;
        assert.ok(functionId, "Function should have an id");

        const invokeArgs = ["bb", "invoke", functionId];
        if (Object.keys(template.invokeParams as object).length > 0) {
          invokeArgs.push("-p", JSON.stringify(template.invokeParams));
        }

        // execFileSync avoids shell quoting issues with JSON params
        const invokeOutput = execFileSync("npx", invokeArgs, {
          cwd: projectDir,
          encoding: "utf-8",
          env: {
            ...process.env,
            BROWSERBASE_API_KEY: API_KEY,
            BROWSERBASE_PROJECT_ID: PROJECT_ID,
          },
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 120_000,
        });

        // 6. bb invoke exits 0 on COMPLETED, 1 on FAILED (throws → test failure)
        assert.ok(
          String(invokeOutput).includes("Invocation Details"),
          `Invoke should produce details output: ${invokeOutput}`,
        );
      });
    });
  }
});
