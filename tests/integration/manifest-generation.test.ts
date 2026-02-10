import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  discoverTemplates,
  getTarballPath,
  setupTemplateProject,
  cleanupDir,
} from "./helpers.js";

const templates = discoverTemplates();
const templatesWithExpected = templates.filter((t) => t.expectedDir !== null);

const tarballPath = getTarballPath();

describe("Manifest Generation", () => {
  for (const template of templatesWithExpected) {
    describe(template.name, () => {
      let projectDir: string;

      before(() => {
        projectDir = setupTemplateProject(template, tarballPath);

        // Run introspection in the temp project
        execSync(`pnpm tsx ${template.entrypoint}`, {
          cwd: projectDir,
          env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
          stdio: "pipe",
        });
      });

      after(() => {
        cleanupDir(projectDir);
      });

      it("creates manifest directory", () => {
        const manifestsDir = join(
          projectDir,
          ".browserbase",
          "functions",
          "manifests",
        );
        assert.ok(
          existsSync(manifestsDir),
          `Expected manifest directory at ${manifestsDir}`,
        );
      });

      it("generates the correct manifest files", () => {
        const manifestsDir = join(
          projectDir,
          ".browserbase",
          "functions",
          "manifests",
        );
        const expectedFiles = readdirSync(template.expectedDir!)
          .filter((f) => f.endsWith(".json"))
          .sort();
        const generatedFiles = readdirSync(manifestsDir)
          .filter((f) => f.endsWith(".json"))
          .sort();

        assert.deepStrictEqual(
          generatedFiles,
          expectedFiles,
          `Manifest files mismatch.\nExpected: ${expectedFiles.join(", ")}\nGenerated: ${generatedFiles.join(", ")}`,
        );
      });

      it("manifest contents match expected", () => {
        const manifestsDir = join(
          projectDir,
          ".browserbase",
          "functions",
          "manifests",
        );
        const expectedFiles = readdirSync(template.expectedDir!)
          .filter((f) => f.endsWith(".json"))
          .sort();

        for (const file of expectedFiles) {
          const expectedPath = join(template.expectedDir!, file);
          const generatedPath = join(manifestsDir, file);

          const expected = JSON.parse(readFileSync(expectedPath, "utf-8"));
          const generated = JSON.parse(readFileSync(generatedPath, "utf-8"));

          assert.deepStrictEqual(
            generated,
            expected,
            `Manifest content mismatch for ${file}.\nExpected: ${JSON.stringify(expected, null, 2)}\nGenerated: ${JSON.stringify(generated, null, 2)}`,
          );
        }
      });
    });
  }

  // Specific assertions per test case
  describe("specific assertions", () => {
    const basicTemplate = templates.find((t) => t.name === "basic");
    const paramsTemplate = templates.find(
      (t) => t.name === "with-params-schema",
    );
    const browserConfigTemplate = templates.find(
      (t) => t.name === "custom-browser-config",
    );
    const nestedTemplate = templates.find(
      (t) => t.name === "nested-entrypoint",
    );

    if (basicTemplate) {
      let projectDir: string;

      before(() => {
        projectDir = setupTemplateProject(basicTemplate, tarballPath);
        execSync(`pnpm tsx ${basicTemplate.entrypoint}`, {
          cwd: projectDir,
          env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
          stdio: "pipe",
        });
      });

      after(() => {
        cleanupDir(projectDir);
      });

      it('basic: manifest is { "name": "sdk-e2e-basic", "config": {} }', () => {
        const manifest = readManifest(projectDir, "sdk-e2e-basic.json");
        assert.equal(manifest.name, "sdk-e2e-basic");
        assert.deepStrictEqual(manifest.config, {});
      });
    }

    if (paramsTemplate) {
      let projectDir: string;

      before(() => {
        projectDir = setupTemplateProject(paramsTemplate, tarballPath);
        execSync(`pnpm tsx ${paramsTemplate.entrypoint}`, {
          cwd: projectDir,
          env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
          stdio: "pipe",
        });
      });

      after(() => {
        cleanupDir(projectDir);
      });

      it("with-params-schema: manifest config includes parametersSchema with correct JSON Schema", () => {
        const manifest = readManifest(projectDir, "sdk-e2e-with-params-schema.json");
        assert.equal(manifest.name, "sdk-e2e-with-params-schema");
        const schema = manifest.config.parametersSchema;
        assert.ok(schema, "parametersSchema should exist");
        assert.equal(schema.type, "object");
        assert.equal(schema.properties.data.type, "number");
        assert.deepStrictEqual(schema.required, ["data"]);
      });
    }

    if (browserConfigTemplate) {
      let projectDir: string;

      before(() => {
        projectDir = setupTemplateProject(browserConfigTemplate, tarballPath);
        execSync(`pnpm tsx ${browserConfigTemplate.entrypoint}`, {
          cwd: projectDir,
          env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
          stdio: "pipe",
        });
      });

      after(() => {
        cleanupDir(projectDir);
      });

      it("custom-browser-config: manifest config includes sessionConfig.browserSettings.advancedStealth", () => {
        const manifest = readManifest(projectDir, "sdk-e2e-custom-browser-config.json");
        assert.equal(manifest.name, "sdk-e2e-custom-browser-config");
        assert.equal(
          manifest.config.sessionConfig.browserSettings.advancedStealth,
          true,
        );
      });
    }

    if (nestedTemplate) {
      let projectDir: string;

      before(() => {
        projectDir = setupTemplateProject(nestedTemplate, tarballPath);
        execSync(`pnpm tsx ${nestedTemplate.entrypoint}`, {
          cwd: projectDir,
          env: { ...process.env, BB_FUNCTIONS_PHASE: "introspect" },
          stdio: "pipe",
        });
      });

      after(() => {
        cleanupDir(projectDir);
      });

      it("nested-entrypoint: manifest generated correctly despite src/index.ts path", () => {
        const manifest = readManifest(projectDir, "sdk-e2e-nested-entrypoint.json");
        assert.equal(manifest.name, "sdk-e2e-nested-entrypoint");
        assert.ok(manifest.config, "config should exist");
      });
    }
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readManifest(projectDir: string, filename: string): any {
  const manifestPath = join(
    projectDir,
    ".browserbase",
    "functions",
    "manifests",
    filename,
  );
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}
