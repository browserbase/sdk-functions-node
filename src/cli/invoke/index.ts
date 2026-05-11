import chalk from "chalk";

import {
  loadBaseConfig,
  apiGet,
  apiPost,
  pollUntil,
  type InvocationStatus,
  isTerminalInvocationStatus,
} from "../shared/index.js";

export interface InvocationResponse {
  id: string;
  functionId: string;
  status: InvocationStatus;
  params?: Record<string, unknown>;
  results?: Record<string, unknown>;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  expiresAt?: string;
}

export interface InvokeOptions {
  functionId: string;
  params?: string;
  apiUrl?: string;
  noWait?: boolean;
  checkStatus?: string;
}

function displayInvocationResult(invocation: InvocationResponse): void {
  console.log(chalk.bold.cyan("\n📋 Invocation Details"));
  console.log(chalk.gray("─".repeat(50)));

  console.log(chalk.white(`Invocation ID: ${chalk.cyan(invocation.id)}`));
  console.log(chalk.white(`Function ID: ${chalk.cyan(invocation.functionId)}`));
  console.log(chalk.white(`Status: ${chalk.cyan(invocation.status)}`));

  if (invocation.sessionId) {
    console.log(chalk.white(`Session ID: ${chalk.cyan(invocation.sessionId)}`));
  }

  if (invocation.startedAt) {
    console.log(
      chalk.white(
        `Started: ${chalk.gray(new Date(invocation.startedAt).toLocaleString())}`,
      ),
    );
  }

  if (invocation.endedAt) {
    console.log(
      chalk.white(
        `Ended: ${chalk.gray(new Date(invocation.endedAt).toLocaleString())}`,
      ),
    );

    if (invocation.startedAt) {
      const duration =
        new Date(invocation.endedAt).getTime() -
        new Date(invocation.startedAt).getTime();
      const seconds = (duration / 1000).toFixed(2);
      console.log(chalk.white(`Duration: ${chalk.cyan(`${seconds}s`)}`));
    }
  }

  if (invocation.results && Object.keys(invocation.results).length > 0) {
    console.log(chalk.bold.cyan("\n📦 Results"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(JSON.stringify(invocation.results, null, 2));
  }
}

export async function invoke(options: InvokeOptions): Promise<void> {
  console.log(chalk.bold.cyan("\nBrowserbase Functions - Invoke\n"));

  try {
    const config = loadBaseConfig(
      options.apiUrl ? { apiUrl: options.apiUrl } : undefined,
    );

    // If --check-status flag is provided, just check status of existing invocation
    if (options.checkStatus) {
      console.log(
        chalk.gray(`Checking status for invocation: ${options.checkStatus}`),
      );

      const status = await apiGet<InvocationResponse>(
        config,
        `/v1/functions/invocations/${options.checkStatus}`,
      );

      if (!status) {
        console.error(chalk.red("\n✗ Failed to get invocation status"));
        process.exit(1);
      }

      displayInvocationResult(status);
      return;
    }

    // Parse params if provided
    let params: Record<string, unknown> = {};
    if (options.params) {
      try {
        params = JSON.parse(options.params);
      } catch {
        console.error(
          chalk.red("Error: Invalid JSON provided for --params flag"),
        );
        console.log(chalk.gray('Example: --params \'{"key": "value"}\''));
        process.exit(1);
      }
    }

    console.log(chalk.gray(`Function ID: ${options.functionId}`));
    console.log(chalk.gray(`API URL: ${config.apiUrl}`));
    if (Object.keys(params).length > 0) {
      console.log(chalk.gray(`Params: ${JSON.stringify(params)}`));
    }

    // Invoke the function
    console.log(chalk.cyan("\nInvoking function..."));
    const endpoint = `/v1/functions/${options.functionId}/invoke`;
    console.log(chalk.gray(`POST ${config.apiUrl}${endpoint}`));

    const result = await apiPost<InvocationResponse>(config, endpoint, {
      params,
    });

    if (!result.success) {
      console.error(chalk.red(`\nInvoke failed: ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green("✓ Function invoked successfully"));
    console.log(chalk.gray(`Invocation ID: ${result.data.id}`));

    // If --no-wait flag is set, just return the invocation ID
    if (options.noWait) {
      console.log(chalk.bold.green("\n✓ Function invoked!"));
      console.log(chalk.gray(`\nInvocation ID: ${result.data.id}`));
      console.log(
        chalk.cyan(
          `\nTo check status later, run:\n  bb invoke ${options.functionId} --check-status ${result.data.id}`,
        ),
      );
      return;
    }

    // Poll for completion
    const finalStatus = await pollUntil(
      () =>
        apiGet<InvocationResponse>(
          config,
          `/v1/functions/invocations/${result.data.id}`,
        ),
      (status) => isTerminalInvocationStatus(status.status),
      (status) => status.status,
      {
        intervalMs: 1000,
        maxAttempts: 900,
        waitingMessage: "Waiting for invocation to complete...",
        timeoutMessage:
          "Invocation is still running after maximum wait time. Use 'bb invoke --check-status <invocationId>' to check later.",
      },
    );

    if (!finalStatus) {
      console.error(chalk.red("\n✗ Failed to get final invocation status"));
      process.exit(1);
    }

    if (finalStatus.status === "COMPLETED") {
      console.log(chalk.green("✓ Invocation completed successfully"));
    } else if (finalStatus.status === "FAILED") {
      console.error(chalk.red("✗ Invocation failed"));
    }

    displayInvocationResult(finalStatus);

    if (finalStatus.status === "FAILED") {
      process.exit(1);
    }
  } catch (error: unknown) {
    console.error(
      chalk.red(
        `\n✗ Invoke failed: ${(error as { message?: string }).message ?? "unknown error"}`,
      ),
    );
    process.exit(1);
  }
}
