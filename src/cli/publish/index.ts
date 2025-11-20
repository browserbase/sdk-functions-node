import chalk from "chalk";

import { loadConfig, validateConfig } from "./config.js";
import { createArchive, validateArchiveSize } from "./archiver.js";
import {
  uploadBuild,
  pollBuildStatus,
  type BuildStatusResponse,
} from "./api-client.js";

export interface PublishOptions {
  entrypoint?: string;
  apiUrl?: string;
  dryRun?: boolean;
}

function displayBuildDetails(build: BuildStatusResponse): void {
  console.log(chalk.bold.cyan("\n📦 Build Details"));
  console.log(chalk.gray("─".repeat(50)));

  // Display basic build information
  console.log(chalk.white(`Build ID: ${chalk.cyan(build.id)}`));
  console.log(chalk.white(`Project ID: ${chalk.cyan(build.projectId)}`));
  console.log(chalk.white(`Status: ${chalk.green(build.status)}`));

  if (build.request?.entrypoint) {
    console.log(
      chalk.white(`Entrypoint: ${chalk.cyan(build.request.entrypoint)}`),
    );
  }

  // Display timing information if available
  if (build.startedAt) {
    console.log(
      chalk.white(
        `Started: ${chalk.gray(new Date(build.startedAt).toLocaleString())}`,
      ),
    );
  }
  if (build.endedAt) {
    console.log(
      chalk.white(
        `Completed: ${chalk.gray(new Date(build.endedAt).toLocaleString())}`,
      ),
    );
    if (build.startedAt) {
      const duration =
        new Date(build.endedAt).getTime() - new Date(build.startedAt).getTime();
      const seconds = Math.floor(duration / 1000);
      console.log(chalk.white(`Duration: ${chalk.cyan(`${seconds} seconds`)}`));
    }
  }
  if (build.expiresAt) {
    console.log(
      chalk.white(
        `Expires: ${chalk.gray(new Date(build.expiresAt).toLocaleString())}`,
      ),
    );
  }

  // Display built functions
  if (build.builtFunctions && build.builtFunctions.length > 0) {
    console.log(chalk.bold.cyan("\n🚀 Built Functions"));
    console.log(chalk.gray("─".repeat(50)));

    build.builtFunctions.forEach((func, index) => {
      console.log(chalk.bold.white(`\n${index + 1}. ${func.name}`));
      console.log(chalk.white(`   Function ID: ${chalk.cyan(func.id)}`));

      if (func.createdVersion) {
        console.log(
          chalk.white(`   Version ID: ${chalk.cyan(func.createdVersion.id)}`),
        );

        // Display browser settings if available
        if (func.createdVersion.sessionCreateParams) {
          const params = func.createdVersion.sessionCreateParams;
          const hasSettings = Object.keys(params).length > 0;

          if (hasSettings) {
            console.log(chalk.white(`   Browser Settings:`));
            Object.entries(params).forEach(([key, value]) => {
              console.log(
                chalk.gray(`     - ${key}: ${JSON.stringify(value)}`),
              );
            });
          }
        }
      }
    });

    console.log(chalk.bold.cyan("\n✨ Next Steps"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(
      chalk.white("Your functions are ready to be invoked! Invoke using cURL:"),
    );

    build.builtFunctions.forEach((func) => {
      console.log(chalk.gray("\n   curl --request POST \\"));
      console.log(
        chalk.gray(
          `     --url ${func.projectId ? "https" : "http"}://api.browserbase.com/v1/functions/${func.id}/invoke \\`,
        ),
      );
      console.log(
        chalk.gray("     --header 'Content-Type: application/json' \\"),
      );
      console.log(chalk.gray("     --header 'x-bb-api-key: YOUR_API_KEY' \\"));
      console.log(chalk.gray("     --data '{\"params\": {}}'"));
    });
  } else {
    console.log(
      chalk.yellow(
        "\nNo functions were built. Please check your entrypoint and function exports.",
      ),
    );
  }
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

          // Display detailed build information and next steps
          displayBuildDetails(buildStatus);
        } else if (buildStatus?.status === "FAILED") {
          console.error(chalk.red("\n✗ Build failed during processing"));

          // Still display build details for failed builds to help with debugging
          if (buildStatus) {
            displayBuildDetails(buildStatus);
          }

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
