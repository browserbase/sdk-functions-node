import { execSync } from "node:child_process";
import {
  readdirSync,
  readFileSync,
  existsSync,
  cpSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { createServer } from "node:net";
import { request } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Path constants ──────────────────────────────────────────────────

// Resolve the real project root relative to the compiled JS location.
// The compiled JS lives in dist-integration-test/tests/integration/,
// so we go up 3 levels to reach the project root.
export const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");
const TEMPLATES_DIR = join(PROJECT_ROOT, "tests", "templates");

// ── Template discovery ──────────────────────────────────────────────

export interface Template {
  name: string;
  dir: string;
  entrypoint: string;
  expectedDir: string | null;
  invokeParams: unknown;
}

export function discoverTemplates(): Template[] {
  const templates: Template[] = [];

  for (const entry of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = join(TEMPLATES_DIR, entry.name);
    const configPath = join(dir, "bb.test.json");

    if (!existsSync(configPath)) continue;

    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      entrypoint: string;
      invokeParams?: unknown;
    };
    const expectedDir = join(dir, "expected");

    templates.push({
      name: entry.name,
      dir,
      entrypoint: config.entrypoint,
      expectedDir: existsSync(expectedDir) ? expectedDir : null,
      invokeParams: config.invokeParams ?? {},
    });
  }

  return templates;
}

// ── SDK tarball ─────────────────────────────────────────────────────

/**
 * Return the absolute path to the pre-built SDK tarball.
 * The tarball is created once by the pretest:integration script
 * (`pnpm pack`) before any test files run.
 */
export function getTarballPath(): string {
  const entries = readdirSync(PROJECT_ROOT);
  const tarball = entries.find(
    (f) => f.startsWith("browserbasehq-sdk-functions-") && f.endsWith(".tgz"),
  );

  if (!tarball) {
    throw new Error(
      "SDK tarball not found in project root. " +
        "Run `pnpm pack` (or use the pretest:integration script) first.",
    );
  }

  return join(PROJECT_ROOT, tarball);
}

// ── Template project setup ──────────────────────────────────────────

const COPY_EXCLUDE = new Set([
  "node_modules",
  "pnpm-lock.yaml",
  ".browserbase",
  "expected",
]);

/**
 * Copy a template directory to a temp dir and install the SDK tarball.
 * Returns the absolute path of the temp project directory.
 */
export function setupTemplateProject(
  template: Template,
  tarballPath: string,
): string {
  const tempDir = mkdtempSync(
    join(tmpdir(), `bb-test-${template.name}-`),
  );

  // Copy template contents, excluding things we don't need in the project
  cpSync(template.dir, tempDir, {
    recursive: true,
    filter: (src) => {
      const basename = src.split("/").pop()!;
      if (src === template.dir) return true;
      return !COPY_EXCLUDE.has(basename);
    },
  });

  // Install SDK from tarball + all other deps from package.json.
  // Use npm instead of pnpm to avoid workspace env var interference
  // when running inside `pnpm test:integration`.
  execSync(`npm install ${tarballPath}`, {
    cwd: tempDir,
    stdio: "pipe",
    env: {
      ...process.env,
      npm_config_fund: "false",
      npm_config_audit: "false",
    },
  });

  return tempDir;
}

// ── Cleanup helpers ─────────────────────────────────────────────────

export function cleanupDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function cleanupFile(path: string): void {
  if (existsSync(path)) {
    rmSync(path);
  }
}

// ── Port allocation ──────────────────────────────────────────────────

export function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Could not determine port"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

// ── HTTP helpers ─────────────────────────────────────────────────────

export interface HttpResponse {
  statusCode: number;
  body: string;
}

export function httpGet(url: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export function httpPost(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);

    const req = request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk: Buffer) => {
          responseBody += chunk.toString();
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body: responseBody });
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

// ── Polling helpers ──────────────────────────────────────────────────

export async function waitForHealthcheck(
  url: string,
  timeoutMs: number = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await httpGet(url);
      if (res.statusCode === 200 && res.body.includes('"ok":true')) {
        return;
      }
    } catch {
      // server not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Healthcheck at ${url} did not pass within ${timeoutMs}ms`);
}

export async function waitForFunctionRegistration(
  baseUrl: string,
  funcName: string,
  apiKey: string,
  timeoutMs: number = 15_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await httpPost(
        `${baseUrl}/v1/functions/${funcName}/invoke`,
        { params: {} },
        { "x-bb-api-key": apiKey },
      );
      if (res.statusCode !== 404) {
        return;
      }
    } catch {
      // server not ready yet
    }
    await sleep(500);
  }
  throw new Error(
    `Function '${funcName}' was not registered within ${timeoutMs}ms`,
  );
}

// ── CLI runner ───────────────────────────────────────────────────────

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// Path to the built CLI entry point, usable from any directory.
const CLI_PATH = join(PROJECT_ROOT, "dist", "cli.js");

export function runBb(
  args: string,
  options?: { cwd?: string; env?: Record<string, string> },
): RunResult {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout: String(stdout ?? ""), stderr: "" };
  } catch (error: unknown) {
    const e = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

// ── Utilities ────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeJson(value: unknown): string {
  return JSON.stringify(
    typeof value === "string" ? JSON.parse(value) : value,
    null,
    2,
  );
}
