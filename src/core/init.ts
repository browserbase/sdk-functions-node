import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { FunctionsCoreError } from "./errors.js";

export type FunctionPackageManager = "npm" | "pnpm";

export type InitProgressEvent =
  | { type: "directory-created"; path: string }
  | { type: "file-created"; path: string }
  | { type: "dependencies-installed"; packageManager: FunctionPackageManager }
  | { type: "git-initialized"; path: string };

export interface CreateFunctionProjectOptions {
  cwd?: string;
  install?: boolean;
  onOutput?: (stream: "stdout" | "stderr", text: string) => void;
  onProgress?: (event: InitProgressEvent) => void;
  packageManager?: FunctionPackageManager;
  packageSpecifier?: string;
  projectName: string;
  scripts?: {
    deploy: string;
    dev: string;
  };
}

export interface CreateFunctionProjectResult {
  packageManager: FunctionPackageManager;
  packageManagerVersion: string;
  projectRoot: string;
}

const envTemplate = `# Browserbase Configuration
# Get your API key from https://browserbase.com/settings

BROWSERBASE_API_KEY=your_api_key_here
`;

const gitignoreTemplate = `node_modules/
.env
.env.local
dist/
.browserbase/
*.log
.DS_Store
`;

const starterFunctionTemplate = `import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("my-function", async (context) => {
  const browser = await chromium.connectOverCDP(context.session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  await page.goto("https://example.com");
  const title = await page.title();

  return { title };
});
`;

const tsconfigTemplate = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
`;

export async function createFunctionProject(
  options: CreateFunctionProjectOptions,
): Promise<CreateFunctionProjectResult> {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.projectName)) {
    throw new FunctionsCoreError(
      `Invalid project name "${options.projectName}". Use a leading letter, then letters, numbers, hyphens, or underscores.`,
      { code: "invalid_project_name" },
    );
  }

  const packageManager = options.packageManager ?? "pnpm";
  if (packageManager !== "npm" && packageManager !== "pnpm") {
    throw new FunctionsCoreError(
      `Unsupported package manager: ${packageManager}`,
      {
        code: "invalid_package_manager",
      },
    );
  }
  const packageManagerVersion = requireCommandVersion(packageManager);
  const cwd = resolve(options.cwd ?? process.cwd());
  const projectRoot = resolve(cwd, options.projectName);
  if (existsSync(projectRoot)) {
    throw new FunctionsCoreError(`Directory already exists: ${projectRoot}`, {
      code: "directory_exists",
    });
  }

  await mkdir(projectRoot, { recursive: true });
  options.onProgress?.({ path: projectRoot, type: "directory-created" });

  const scripts = options.scripts ?? {
    deploy: "bb publish index.ts",
    dev: "bb dev index.ts",
  };
  const packageJson = {
    name: options.projectName,
    version: "1.0.0",
    private: true,
    packageManager: `${packageManager}@${packageManagerVersion}`,
    type: "module",
    scripts,
  };

  const files: Record<string, string> = {
    ".env": envTemplate,
    ".gitignore": gitignoreTemplate,
    "index.ts": starterFunctionTemplate,
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "tsconfig.json": tsconfigTemplate,
  };
  for (const [name, contents] of Object.entries(files)) {
    const path = join(projectRoot, name);
    await writeFile(path, contents);
    options.onProgress?.({ path, type: "file-created" });
  }

  if (options.install ?? true) {
    const packageSpecifier =
      options.packageSpecifier ?? "@browserbasehq/sdk-functions";
    const install = packageManager === "pnpm" ? ["add"] : ["install"];
    const installDev =
      packageManager === "pnpm" ? ["add", "-D"] : ["install", "--save-dev"];

    runPackageManager(
      packageManager,
      [...install, packageSpecifier, "playwright-core", "zod"],
      projectRoot,
      options.onOutput,
    );
    runPackageManager(
      packageManager,
      [...installDev, "typescript", "@types/node"],
      projectRoot,
      options.onOutput,
    );
    options.onProgress?.({ packageManager, type: "dependencies-installed" });
  }

  const git = spawnSync("git", ["init"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!git.error && git.status === 0) {
    options.onProgress?.({ path: projectRoot, type: "git-initialized" });
  }

  return { packageManager, packageManagerVersion, projectRoot };
}

function requireCommandVersion(command: FunctionPackageManager): string {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) {
    throw new FunctionsCoreError(
      `${command} is required but was not found on PATH.`,
      {
        cause: result.error,
        code: "invalid_package_manager",
      },
    );
  }
  return result.stdout.trim();
}

function runPackageManager(
  packageManager: FunctionPackageManager,
  args: string[],
  cwd: string,
  onOutput?: (stream: "stdout" | "stderr", text: string) => void,
): void {
  const result = spawnSync(packageManager, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) {
    onOutput?.("stdout", result.stdout);
  }
  if (result.stderr) {
    onOutput?.("stderr", result.stderr);
  }
  if (result.error || result.status !== 0) {
    throw new FunctionsCoreError(
      `Failed to install dependencies with ${packageManager}.`,
      { cause: result.error, code: "package_install_failed" },
    );
  }
}
