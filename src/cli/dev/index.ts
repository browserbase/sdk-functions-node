import chalk from "chalk";
import { startServer } from "./server.js";
import { InvocationBridge } from "./bridge.js";
import { ProcessManager } from "./process.js";

export interface DevServerOptions {
  entrypoint: string;
  port: number;
  host: string;
  verbose: boolean;
}

export async function startDevServer(options: DevServerOptions): Promise<void> {
  const { entrypoint, port, host, verbose } = options;

  // Check if we're in production mode
  if (process.env["NODE_ENV"] === "production") {
    console.warn(
      chalk.yellow(
        "⚠️  Warning: Running dev server in production mode. This is not recommended.",
      ),
    );
  }

  // Set the runtime API URL
  const runtimeApiUrl = `${host}:${port}`;

  if (verbose) {
    console.log(chalk.gray(`Runtime API URL: ${runtimeApiUrl}`));
  }

  // Create the invocation bridge
  const bridge = new InvocationBridge(verbose);

  // Create the process manager
  const processManager = new ProcessManager({
    entrypoint,
    runtimeApiUrl,
    verbose,
  });

  // Start the server
  let server: any = null;

  try {
    // Start the server first
    server = await startServer({
      port,
      host,
      bridge,
      verbose,
    });

    console.log(
      chalk.green(`✓ Development server listening on http://${host}:${port}`),
    );

    // Then start the user's function process
    console.log(chalk.cyan("Starting runtime process..."));
    await processManager.start();

    // Wait a moment for the runtime to connect
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (bridge.isRuntimeConnected()) {
      console.log(chalk.green("✓ Runtime connected and ready"));
    } else {
      console.log(chalk.yellow("⚠️  Waiting for runtime to connect..."));
    }

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log(chalk.cyan("\n📦 Shutting down..."));

      // Stop the user process first
      await processManager.stop();

      // Then close the server
      return new Promise<void>((resolve) => {
        server.close(() => {
          console.log(chalk.green("✓ Server closed"));
          resolve();
        });
      });
    };

    // Handle process termination
    process.on("SIGINT", async () => {
      await shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error(chalk.red("Failed to start:"), error);

    // Clean up on error
    if (processManager.isRunning()) {
      await processManager.stop();
    }
    if (server) {
      server.close();
    }

    throw error;
  }
}

