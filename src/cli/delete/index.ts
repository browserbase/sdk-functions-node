import chalk from "chalk";

import {
  deleteFunction,
  type DeleteFunctionResponse,
} from "../../delete/index.js";

export interface DeleteOptions {
  apiUrl?: string;
  functionId: string;
}

export async function removeFunction(
  options: DeleteOptions,
): Promise<DeleteFunctionResponse> {
  const result = await deleteFunction({
    functionId: options.functionId,
    ...(options.apiUrl ? { baseUrl: options.apiUrl } : {}),
  });

  if (result.deleted) {
    console.log(chalk.green("✓ Function deleted"));
  } else {
    console.log(chalk.yellow("No active function was deleted"));
  }
  return result;
}
