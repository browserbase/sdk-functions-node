import chalk from "chalk";

import { loadConfig, validateConfig } from "./config.js";
import { createArchive, validateArchiveSize } from "./archiver.js";
import { uploadBuild, pollBuildStatus } from "./api-client.js";

export interface PublishOptions {
  entrypoint?: string;
  apiUrl?: string;
  dryRun?: boolean;
}

export async function publishFunction(options: PublishOptions): Promise<void> {
  console.log(chalk.bold.cyan("\nBrowserbase Functions - Publish\n"));

  try {
    // Load and validate configuration
    const configOptions: { entrypoint?: string; apiUrl?: string } = {};
    if (options.entrypoint !== undefined) {
      configOptions.entrypoint = options.entrypoint;
    }
    if (options.apiUrl !== undefined) {
      configOptions.apiUrl = options.apiUrl;
    }
    const config = loadConfig(configOptions);

    validateConfig(config);

    console.log(chalk.gray(`Working directory: ${config.workingDirectory}`));
    console.log(chalk.gray(`Entrypoint: ${config.entrypoint}`));
    console.log(chalk.gray(`API URL: ${config.apiUrl}`));
    console.log(chalk.gray(`Project ID: ${config.projectId}`));

    if (options.dryRun) {
      console.log(
        chalk.yellow("\n[Dry run mode - no files will be uploaded]\n"),
      );
    }

    // Create archive
    const archiveOptions: { dryRun?: boolean } = {};
    if (options.dryRun !== undefined) {
      archiveOptions.dryRun = options.dryRun;
    }
    const archive = await createArchive(
      config.workingDirectory,
      archiveOptions,
    );

    // Validate archive size
    validateArchiveSize(archive.size);

    // Upload build
    const uploadOptions: { dryRun?: boolean } = {};
    if (options.dryRun !== undefined) {
      uploadOptions.dryRun = options.dryRun;
    }
    const result = await uploadBuild(config, archive.buffer, uploadOptions);

    if (!result.success) {
      console.error(chalk.red("\n✗ Publish failed"));
      process.exit(1);
    }

    // Success!
    if (options.dryRun) {
      console.log(chalk.bold.green("\n✓ Dry run completed successfully!"));
      console.log(
        chalk.cyan(
          "\nYour function would have been published. Run without --dry-run to publish.",
        ),
      );
    } else {
      console.log(chalk.bold.green("\n✓ Function uploaded successfully!"));

      if (result.buildId) {
        console.log(chalk.gray(`\nBuild ID: ${result.buildId}`));

        // Poll for build status
        const buildStatus = await pollBuildStatus(config, result.buildId);

        if (buildStatus?.status === "COMPLETED") {
          console.log(
            chalk.bold.green(
              "\n🎉 Your function has been deployed and is ready for invocation!",
            ),
          );
        } else if (buildStatus?.status === "FAILED") {
          console.error(chalk.red("\n✗ Build failed during processing"));
          process.exit(1);
        } else {
          console.log(
            chalk.yellow(
              "\nBuild status could not be determined. Check the dashboard for updates.",
            ),
          );
        }
      } else {
        console.log(
          chalk.cyan(
            "\nYour function will be available for invocation once the build is processed.",
          ),
        );
      }
    }
  } catch (error: unknown) {
    console.error(
      chalk.red(
        `\n✗ Publish failed: ${(error as { message?: string }).message ?? "unknown error"}`,
      ),
    );

    // if (error.stack && process.env.DEBUG) {
    //   console.error(chalk.gray(error.stack));
    // }

    process.exit(1);
  }
}
