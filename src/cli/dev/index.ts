import chalk from "chalk";

import {
  startDevServer as startDevServerCore,
  type DevServerHandle,
} from "../../core/index.js";

export interface DevServerOptions {
  entrypoint: string;
  port: number;
  host: string;
  verbose?: boolean;
}

export async function startDevServerCli(
  options: DevServerOptions,
): Promise<DevServerHandle> {
  const handle = await startDevServerCore({
    ...options,
    onLog(event) {
      const output = event.level === "error" ? process.stderr : process.stdout;
      output.write(`${event.message}\n`);
    },
  });
  console.log(
    handle.runtimeConnected
      ? chalk.green(`✓ Development server listening on ${handle.url}`)
      : chalk.yellow(
          `⚠️ Development server is listening on ${handle.url}, but the runtime has not connected yet.`,
        ),
  );

  const shutdown = async () => {
    console.log(chalk.cyan("\n📦 Shutting down..."));
    await handle.close();
  };
  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
  return handle;
}

// Backwards-compatible internal name used by the Commander adapter.
export const startDevServer = startDevServerCli;
