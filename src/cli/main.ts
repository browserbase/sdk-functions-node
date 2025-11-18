#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { startDevServer } from "./dev/index.js";

// Version is injected at build time
declare const __CLI_VERSION__: string;

const program = new Command();

program
  .name("bb")
  .description("Browserbase Functions CLI")
  .version(__CLI_VERSION__);

program
  .command("dev")
  .description(
    "Start a local development server for testing Browserbase Functions",
  )
  .argument(
    "<entrypoint>",
    "Path to the TypeScript/JavaScript file that imports all your functions",
  )
  .option("-p, --port <number>", "Port to listen on", "14113")
  .option("-h, --host <string>", "Host to bind to", "127.0.0.1")
  .action(async (entrypoint, options) => {
    try {
      // Validate entrypoint file exists
      const fs = await import("fs");
      const path = await import("path");

      const entrypointPath = path.resolve(entrypoint);
      if (!fs.existsSync(entrypointPath)) {
        console.error(
          chalk.red(`Error: Entrypoint file not found: ${entrypointPath}`),
        );
        process.exit(1);
      }

      // Validate file extension
      const ext = path.extname(entrypointPath);
      if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
        console.error(
          chalk.red(
            `Error: Invalid file extension. Expected .ts, .tsx, .js, .jsx, .mjs, or .cjs`,
          ),
        );
        process.exit(1);
      }

      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(
          chalk.red("Error: Invalid port number. Must be between 1 and 65535."),
        );
        process.exit(1);
      }

      console.log(
        chalk.cyan("Starting Browserbase Functions development server..."),
      );
      console.log(chalk.gray(`Entrypoint: ${entrypointPath}`));

      await startDevServer({
        entrypoint: entrypointPath,
        port,
        host: options.host,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(chalk.red("Failed to start development server:"), error);
      process.exit(1);
    }
  });

program
  .command("publish")
  .description("Publish your Browserbase Function to the cloud")
  .argument(
    "<entrypoint>",
    "Path to the TypeScript/JavaScript file that imports all your functions",
  )
  .option("-u, --api-url <url>", "API endpoint URL")
  .option("--dry-run", "Show what would be published without uploading")
  .action(async (entrypoint, options) => {
    try {
      const { publishFunction } = await import("./publish/index.js");
      await publishFunction({
        entrypoint: entrypoint,
        apiUrl: options.apiUrl,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error(chalk.red("Publish failed:"), error);
      process.exit(1);
    }
  });

program.parse();
