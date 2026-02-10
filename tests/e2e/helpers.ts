import { execFileSync, execSync } from "node:child_process";
import { join } from "node:path";
import dotenv from "dotenv";

// Load .env.e2e from project root before reading env vars.
// The compiled JS lives in dist-integration-test/tests/e2e/,
// so we go up 3 levels to reach the project root.
const PROJECT_ROOT_LOCAL = join(import.meta.dirname, "..", "..", "..");
dotenv.config({ path: join(PROJECT_ROOT_LOCAL, ".env.e2e") });

// ── Credentials ──────────────────────────────────────────────────

export const API_KEY = process.env["BROWSERBASE_API_KEY"];
export const PROJECT_ID = process.env["BROWSERBASE_PROJECT_ID"];
export const API_URL =
  process.env["BROWSERBASE_API_URL"] ?? "https://api.browserbase.com";

export function requireCredentials(): void {
  if (!API_KEY || !PROJECT_ID) {
    throw new Error(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set for e2e tests",
    );
  }
}

// ── Browserbase API client ───────────────────────────────────────

export function bbApi(
  method: string,
  path: string,
  body?: unknown,
): { status: number; data: unknown } {
  const args = [
    "-s",
    "-w",
    "\n%{http_code}",
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

  // Use execFileSync to avoid shell interpretation issues with
  // header values that contain spaces.
  const output = execFileSync("curl", args, {
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

// ── Build polling ────────────────────────────────────────────────

export function pollBuildStatus(
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

// ── Re-exports from integration helpers ──────────────────────────

export {
  discoverTemplates,
  getTarballPath,
  setupTemplateProject,
  cleanupDir,
  PROJECT_ROOT,
} from "../integration/helpers.js";
export type { Template } from "../integration/helpers.js";
