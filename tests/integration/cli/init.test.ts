import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runBb } from "../helpers.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `bb-init-test-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

describe("Init Command", () => {
  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scaffolds correct project structure", () => {
    const dir = createTempDir("scaffold");
    const projectName = "test-proj";

    const result = runBb(`init ${projectName}`, { cwd: dir });

    assert.equal(
      result.exitCode,
      0,
      `bb init should succeed.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );

    const projectDir = join(dir, projectName);
    assert.ok(
      existsSync(join(projectDir, "package.json")),
      "package.json should exist",
    );
    assert.ok(
      existsSync(join(projectDir, "index.ts")),
      "index.ts should exist",
    );
    assert.ok(existsSync(join(projectDir, ".env")), ".env should exist");
    assert.ok(
      existsSync(join(projectDir, ".gitignore")),
      ".gitignore should exist",
    );
    assert.ok(
      existsSync(join(projectDir, "tsconfig.json")),
      "tsconfig.json should exist",
    );
    assert.ok(
      existsSync(join(projectDir, ".git")),
      ".git directory should exist",
    );
  });

  it("package.json has correct contents", () => {
    const dir = createTempDir("pkgjson");
    const projectName = "test-pkg";

    runBb(`init ${projectName}`, { cwd: dir });

    const pkgPath = join(dir, projectName, "package.json");
    assert.ok(existsSync(pkgPath), "package.json should exist");

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.equal(pkg.type, "module", 'Should have "type": "module"');

    // Check dependencies include expected packages
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(
      allDeps["@browserbasehq/sdk-functions"],
      "Should depend on @browserbasehq/sdk-functions",
    );
    assert.ok(allDeps["playwright-core"], "Should depend on playwright-core");
    assert.ok(allDeps["zod"], "Should depend on zod");
  });

  it("rejects invalid project names", () => {
    const dir = createTempDir("invalid-name");

    const result = runBb("init 123invalid", { cwd: dir });

    assert.notEqual(
      result.exitCode,
      0,
      "Should reject project name starting with number",
    );
  });

  it("rejects existing directory", () => {
    const dir = createTempDir("existing");
    const projectName = "existing-dir";

    // Create the directory first
    execSync(`mkdir -p ${join(dir, projectName)}`);

    const result = runBb(`init ${projectName}`, { cwd: dir });

    assert.notEqual(
      result.exitCode,
      0,
      "Should reject when directory already exists",
    );
  });
});
