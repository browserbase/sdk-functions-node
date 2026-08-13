import { relative, resolve } from "node:path";

import {
  createFunctionArchive,
  listFunctionArchiveEntries,
} from "./archive.js";
import { FunctionsCoreError } from "./errors.js";
import {
  functionsGet,
  functionsRequest,
  pollUntil,
  resolveEntrypoint,
  resolveFunctionsApiConfig,
  type FunctionsApiConfig,
  type ResolveFunctionsApiConfigOptions,
} from "./shared.js";

export type BuildStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface FunctionCreatedVersion {
  id: string;
  functionId: string;
  functionBuildId: string;
  sessionCreateParams?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface BuiltFunction {
  id: string;
  name: string;
  createdVersion?: FunctionCreatedVersion;
  createdAt?: string;
  updatedAt?: string;
}

export interface BuildStatusResponse {
  id: string;
  status: BuildStatus;
  request?: { entrypoint?: string; projectId?: string };
  builtFunctions?: BuiltFunction[];
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  endedAt?: string;
  expiresAt?: string;
}

export interface PublishFunctionOptions
  extends ResolveFunctionsApiConfigOptions {
  cwd?: string;
  dryRun?: boolean;
  entrypoint: string;
  projectId?: string;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
  onBuildStatus?: (build: BuildStatusResponse, attempt: number) => void;
}

export interface PublishDryRunResult {
  baseUrl: string;
  dryRun: true;
  entrypoint: string;
  files: string[];
  projectId?: string;
}

export interface PublishCompletedResult {
  build: BuildStatusResponse;
  dryRun: false;
}

export type PublishFunctionResult =
  | PublishDryRunResult
  | PublishCompletedResult;

export async function publishFunction(
  options: PublishFunctionOptions,
): Promise<PublishFunctionResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const entrypoint = await resolveEntrypoint(options.entrypoint, cwd);
  const entrypointPath = relative(cwd, entrypoint);
  const config = resolveFunctionsApiConfig(options);

  if (options.dryRun) {
    const result: PublishDryRunResult = {
      baseUrl: config.baseUrl,
      dryRun: true,
      entrypoint: entrypointPath,
      files: await listFunctionArchiveEntries(cwd),
    };
    if (options.projectId !== undefined) {
      result.projectId = options.projectId;
    }
    return result;
  }

  const archive = await createFunctionArchive(cwd);
  const metadata: { entrypoint: string; projectId?: string } = {
    entrypoint: entrypointPath,
  };
  if (options.projectId !== undefined) {
    metadata.projectId = options.projectId;
  }

  const formData = new FormData();
  formData.append("metadata", JSON.stringify(metadata));
  formData.append(
    "archive",
    new Blob([archive.buffer], { type: "application/gzip" }),
    "archive.tar.gz",
  );

  const uploadResponse = await functionsRequest(
    config,
    "/v1/functions/builds",
    {
      method: "POST",
      body: formData,
    },
  );
  const uploaded = (await uploadResponse.json()) as { id?: string };
  if (!uploaded.id) {
    throw new FunctionsCoreError(
      "Build upload completed without returning a build ID.",
      { code: "build_missing_id" },
    );
  }

  const build = await pollUntil(
    () => getBuildStatus(config, uploaded.id as string),
    {
      done: (result) => !["PENDING", "RUNNING"].includes(result.status),
      intervalMs: options.pollIntervalMs ?? 2_000,
      maxAttempts: options.pollMaxAttempts ?? 100,
      ...(options.onBuildStatus ? { onPoll: options.onBuildStatus } : {}),
    },
  );

  if (build.status === "FAILED") {
    throw new FunctionsCoreError("Function build failed during processing.", {
      code: "build_failed",
      responseBody: build,
    });
  }

  return { build, dryRun: false };
}

export async function getBuildStatus(
  config: FunctionsApiConfig,
  buildId: string,
): Promise<BuildStatusResponse> {
  return await functionsGet<BuildStatusResponse>(
    config,
    `/v1/functions/builds/${buildId}`,
  );
}
