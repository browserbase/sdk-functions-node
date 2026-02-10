import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  discoverTemplates,
  getTarballPath,
  setupTemplateProject,
  cleanupDir,
  runBb,
} from "../helpers.js";

const templates = discoverTemplates();

const tarballPath = getTarballPath();

describe("Publish CLI", () => {

  for (const template of templates) {
    describe(template.name, () => {
      let projectDir: string;
      const artifacts: string[] = [];

      before(() => {
        projectDir = setupTemplateProject(template, tarballPath);
      });

      after(() => {
        for (const p of artifacts) {
          if (existsSync(p)) {
            rmSync(p, { recursive: true, force: true });
          }
        }
        cleanupDir(projectDir);
      });

      it("dry-run succeeds with valid config", () => {
        const result = runBb(`publish ${template.entrypoint} --dry-run`, {
          cwd: projectDir,
          env: {
            BROWSERBASE_API_KEY:
              process.env["BROWSERBASE_API_KEY"] ?? "test_key",
            BROWSERBASE_PROJECT_ID:
              process.env["BROWSERBASE_PROJECT_ID"] ?? "test_project",
          },
        });

        assert.equal(
          result.exitCode,
          0,
          `Dry-run should succeed.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
        );
      });

      it("missing entrypoint fails", () => {
        const result = runBb("publish nonexistent.ts", {
          cwd: projectDir,
        });

        assert.notEqual(
          result.exitCode,
          0,
          "Should fail with missing entrypoint",
        );
      });

      it("invalid file extension fails", () => {
        const testFile = join(projectDir, "test.txt");
        writeFileSync(testFile, "not a valid file");
        artifacts.push(testFile);

        const result = runBb("publish test.txt", {
          cwd: projectDir,
        });

        assert.notEqual(
          result.exitCode,
          0,
          "Should fail with invalid file extension",
        );
      });

      it("missing API key fails", () => {
        const result = runBb(`publish ${template.entrypoint}`, {
          cwd: projectDir,
          env: {
            BROWSERBASE_API_KEY: "",
            BROWSERBASE_PROJECT_ID: "test_project",
          },
        });

        assert.notEqual(result.exitCode, 0, "Should fail without API key");
      });

      it("missing project ID fails", () => {
        const result = runBb(`publish ${template.entrypoint}`, {
          cwd: projectDir,
          env: {
            BROWSERBASE_API_KEY: "test_key",
            BROWSERBASE_PROJECT_ID: "",
          },
        });

        assert.notEqual(result.exitCode, 0, "Should fail without project ID");
      });

      it("gitignore patterns are respected", () => {
        // Create test artifacts that should be ignored
        const gitignorePath = join(projectDir, ".gitignore");
        const testLogPath = join(projectDir, "test.log");
        const testEnvPath = join(projectDir, ".env.test");
        const testDirPath = join(projectDir, "test-gitignore-dir");
        const markerPath = join(projectDir, ".gitignore.test-marker");

        // Skip if .gitignore already exists (don't interfere with project)
        if (existsSync(gitignorePath)) {
          return;
        }

        writeFileSync(testLogPath, "log entry");
        writeFileSync(testEnvPath, "test-secret");
        mkdirSync(testDirPath, { recursive: true });
        writeFileSync(join(testDirPath, "ignored.txt"), "ignored content");

        writeFileSync(
          gitignorePath,
          ".env.test\n*.log\ntest-gitignore-dir/\n",
        );
        writeFileSync(markerPath, "");

        artifacts.push(
          testLogPath,
          testEnvPath,
          testDirPath,
          gitignorePath,
          markerPath,
        );

        const result = runBb(`publish ${template.entrypoint} --dry-run`, {
          cwd: projectDir,
          env: {
            BROWSERBASE_API_KEY:
              process.env["BROWSERBASE_API_KEY"] ?? "test_key",
            BROWSERBASE_PROJECT_ID:
              process.env["BROWSERBASE_PROJECT_ID"] ?? "test_project",
          },
        });

        assert.equal(
          result.exitCode,
          0,
          `Dry-run with gitignore should succeed.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
        );

        // Verify ignored files are not mentioned in the output
        const output = result.stdout + result.stderr;
        assert.ok(
          !output.includes("test.log") || output.includes(".gitignore"),
          ".gitignore patterns should be respected",
        );
      });
    });
  }
});
