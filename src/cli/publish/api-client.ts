import chalk from "chalk";

import { type PublishConfig } from "./config.js";
import {
  parseErrorResponse,
  pollUntil,
  type BuildStatus,
  isTerminalBuildStatus,
} from "../shared/index.js";

export interface BuildMetadata {
  entrypoint: string;
  projectId?: string;
}

export interface UploadResult {
  buildId?: string;
  success: boolean;
  message?: string;
}

export interface FunctionCreatedVersion {
  id: string;
  projectId: string;
  functionId: string;
  functionBuildId: string;
  sessionCreateParams?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BuiltFunction {
  id: string;
  projectId: string;
  name: string;
  createdVersion: FunctionCreatedVersion;
  createdAt: string;
  updatedAt: string;
}

export interface BuildStatusResponse {
  id: string;
  projectId: string;
  status: BuildStatus;
  request: {
    entrypoint: string;
  };
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt?: string;
  expiresAt: string;
  builtFunctions?: BuiltFunction[];
}

export async function uploadBuild(
  config: PublishConfig,
  archiveBuffer: Buffer,
  options?: {
    dryRun?: boolean;
  },
): Promise<UploadResult> {
  if (options?.dryRun) {
    console.log(chalk.cyan("\n[Dry run] Would upload to:"));
    console.log(chalk.gray(`  URL: ${config.apiUrl}/v1/functions/builds`));
    console.log(chalk.gray(`  Project ID: ${config.projectId}`));
    console.log(chalk.gray(`  Entrypoint: ${config.entrypoint}`));
    console.log(
      chalk.gray(
        `  Archive size: ${(archiveBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
      ),
    );
    return {
      success: true,
      message: "Dry run completed successfully",
    };
  }

  console.log(chalk.cyan("\nUploading build..."));

  try {
    // Create form data
    const formData = new FormData();

    // Add metadata
    const metadata: BuildMetadata = {
      entrypoint: config.entrypoint,
      projectId: config.projectId,
    };
    formData.append("metadata", JSON.stringify(metadata));

    // Add archive file as a blob
    const blob = new Blob([archiveBuffer], { type: "application/gzip" });
    formData.append("archive", blob, "archive.tar.gz");

    // Make the request
    const url = `${config.apiUrl}/v1/functions/builds`;
    console.log(chalk.gray(`Uploading to: ${url}`));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-bb-api-key": config.apiKey,
      },
      body: formData,
    });

    // Handle response
    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      console.error(chalk.red(`Upload failed: ${errorMessage}`));
      return {
        success: false,
        message: errorMessage,
      };
    }

    // Parse successful response
    let responseData: { id?: string } = {};
    try {
      const jsonResponse = await response.json();
      if (typeof jsonResponse === "object" && jsonResponse !== null) {
        responseData = jsonResponse as { id?: string };
      }
    } catch {
      // Response might not be JSON
    }

    if (!responseData.id) {
      console.error(
        chalk.red("Upload failed: No build ID received in response"),
      );
      return {
        success: false,
        message: "No build ID received in response",
      };
    }

    console.log(chalk.green("✓ Build uploaded successfully"));
    console.log(chalk.gray(`Build ID: ${responseData.id}`));

    return {
      success: true,
      buildId: responseData.id,
      message: "Build uploaded successfully",
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error(chalk.red(`Upload error: ${errorMessage}`));

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ECONNREFUSED"
    ) {
      console.log(
        chalk.yellow(
          `\nCannot connect to ${config.apiUrl}. Make sure the API server is running.`,
        ),
      );
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}

async function getBuildStatus(
  config: PublishConfig,
  buildId: string,
): Promise<BuildStatusResponse | null> {
  try {
    const url = `${config.apiUrl}/v1/functions/builds/${buildId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-bb-api-key": config.apiKey,
      },
    });

    if (!response.ok) {
      console.error(
        chalk.red(`Failed to get build status: HTTP ${response.status}`),
      );
      return null;
    }

    const data = await response.json();
    return data as BuildStatusResponse;
  } catch (error) {
    console.error(
      chalk.red(
        `Error fetching build status: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    );
    return null;
  }
}

export async function pollBuildStatus(
  config: PublishConfig,
  buildId: string,
  options?: {
    intervalMs?: number;
    maxAttempts?: number;
  },
): Promise<BuildStatusResponse | null> {
  console.log(
    chalk.gray("(Builds typically take around 1 minute to complete)"),
  );

  const result = await pollUntil(
    () => getBuildStatus(config, buildId),
    (status) => isTerminalBuildStatus(status.status),
    (status) => status.status,
    {
      intervalMs: options?.intervalMs ?? 2000,
      maxAttempts: options?.maxAttempts ?? 100,
      waitingMessage: "Waiting for build to complete...",
      timeoutMessage:
        "Build is still running after maximum wait time (~3 minutes). Please check the dashboard for the current build status.",
    },
  );

  if (result) {
    if (result.status === "COMPLETED") {
      console.log(chalk.green("✓ Build completed successfully"));
    } else if (result.status === "FAILED") {
      console.error(chalk.red("✗ Build failed"));
    }
  }

  return result;
}
