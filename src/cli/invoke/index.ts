import chalk from "chalk";

import {
  invokeFunction,
  parseJsonArgument,
  type InvocationResponse,
} from "../../core/index.js";

export interface InvokeOptions {
  functionId: string;
  params?: string;
  apiUrl?: string;
  noWait?: boolean;
  checkStatus?: string;
}

export async function invoke(options: InvokeOptions): Promise<void> {
  console.log(chalk.bold.cyan("\nBrowserbase Functions - Invoke\n"));
  const invocation = await invokeFunction({
    functionId: options.functionId,
    params: parseJsonArgument(options.params, "--params"),
    ...(options.apiUrl ? { baseUrl: options.apiUrl } : {}),
    ...(options.checkStatus ? { checkStatus: options.checkStatus } : {}),
    ...(options.noWait !== undefined ? { noWait: options.noWait } : {}),
    onInvocationStatus(status, attempt) {
      process.stdout.write(
        `\r${chalk.gray(`Status: ${status.status}... (${attempt}/900)`)}`,
      );
    },
  });

  process.stdout.write("\r" + " ".repeat(70) + "\r");
  if (options.noWait) {
    console.log(chalk.green("✓ Function invoked successfully"));
  } else if (!options.checkStatus) {
    console.log(chalk.green("✓ Invocation completed successfully"));
  }
  displayInvocationResult(invocation);
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
  if (invocation.results !== undefined) {
    console.log(chalk.bold.cyan("\n📦 Results"));
    console.log(JSON.stringify(invocation.results, null, 2));
  }
}
