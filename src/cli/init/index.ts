import chalk from "chalk";

import {
  createFunctionProject,
  type CreateFunctionProjectOptions,
} from "../../core/index.js";

export interface InitOptions {
  projectName: string;
  packageManager?: "npm" | "pnpm";
}

export async function init(options: InitOptions): Promise<void> {
  console.log(
    chalk.cyan(
      `🚀 Creating new Browserbase Functions project: ${chalk.bold(options.projectName)}`,
    ),
  );
  const coreOptions: CreateFunctionProjectOptions = {
    projectName: options.projectName,
    onOutput(stream, text) {
      (stream === "stderr" ? process.stderr : process.stdout).write(text);
    },
  };
  if (options.packageManager !== undefined) {
    coreOptions.packageManager = options.packageManager;
  }
  const result = await createFunctionProject(coreOptions);

  console.log(chalk.green.bold("\n✨ Project initialized successfully!\n"));
  console.log(chalk.cyan("Next steps:"));
  console.log(chalk.gray(`1. cd ${options.projectName}`));
  console.log(chalk.gray("2. Add your Browserbase API key to .env"));
  console.log(
    chalk.gray(
      `3. ${result.packageManager === "pnpm" ? "pnpm" : "npm run"} dev`,
    ),
  );
  console.log(
    chalk.gray(
      `4. ${result.packageManager === "pnpm" ? "pnpm" : "npm run"} deploy`,
    ),
  );
}
