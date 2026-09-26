import chalk from "chalk";

import {
  publishFunction as publishFunctionCore,
  type BuildStatusResponse,
} from "../../core/index.js";

export interface PublishOptions {
  entrypoint?: string;
  apiUrl?: string;
  dryRun?: boolean;
}

export async function publishFunction(options: PublishOptions): Promise<void> {
  console.log(chalk.bold.cyan("\nBrowserbase Functions - Publish\n"));
  const result = await publishFunctionCore({
    entrypoint: options.entrypoint ?? "main.ts",
    ...(options.apiUrl ? { baseUrl: options.apiUrl } : {}),
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    onBuildStatus(build, attempt) {
      process.stdout.write(
        `\r${chalk.gray(`Status: ${build.status}... (${attempt}/100)`)}`,
      );
    },
  });

  if (result.dryRun) {
    console.log(chalk.yellow("[Dry run mode - no files uploaded]"));
    console.log(chalk.gray(`Entrypoint: ${result.entrypoint}`));
    for (const file of result.files) {
      console.log(chalk.gray(`  + ${file}`));
    }
    console.log(chalk.bold.green("\n✓ Dry run completed successfully!"));
    return;
  }

  process.stdout.write("\r" + " ".repeat(70) + "\r");
  console.log(
    chalk.bold.green("🎉 Function deployed and ready for invocation!"),
  );
  displayBuildDetails(result.build);
}

function displayBuildDetails(build: BuildStatusResponse): void {
  console.log(chalk.bold.cyan("\n📦 Build Details"));
  console.log(chalk.gray("─".repeat(50)));
  console.log(chalk.white(`Build ID: ${chalk.cyan(build.id)}`));
  console.log(chalk.white(`Status: ${chalk.green(build.status)}`));
  if (build.request?.entrypoint) {
    console.log(
      chalk.white(`Entrypoint: ${chalk.cyan(build.request.entrypoint)}`),
    );
  }
  if (build.builtFunctions?.length) {
    console.log(chalk.bold.cyan("\n🚀 Built Functions"));
    for (const [index, func] of build.builtFunctions.entries()) {
      console.log(chalk.bold.white(`\n${index + 1}. ${func.name}`));
      console.log(chalk.white(`   Function ID: ${chalk.cyan(func.id)}`));
      if (func.createdVersion?.id) {
        console.log(
          chalk.white(`   Version ID: ${chalk.cyan(func.createdVersion.id)}`),
        );
      }
    }
  }
}
