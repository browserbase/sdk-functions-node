import { spawn, ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import chalk from "chalk";

export interface ProcessManagerOptions {
  entrypoint: string;
  runtimeApiUrl: string;
  verbose: boolean;
}

/**
 * Interface for managing the lifecycle of the user's function process.
 * Spawns tsx watch to enable hot reloading during development.
 */
export interface IProcessManager {
  /**
   * Start the user's function process using tsx watch.
   */
  start(): Promise<void>;

  /**
   * Stop the user's function process.
   */
  stop(): Promise<void>;

  /**
   * Check if the process is currently running.
   */
  isRunning(): boolean;
}

/**
 * Manages the lifecycle of the user's function process.
 * Spawns tsx watch to enable hot reloading during development.
 */
export class ProcessManager implements IProcessManager {
  private process: ChildProcess | null = null;
  private entrypoint: string;
  private runtimeApiUrl: string;
  private verbose: boolean;
  private isShuttingDown = false;

  constructor(options: ProcessManagerOptions) {
    this.entrypoint = options.entrypoint;
    this.runtimeApiUrl = options.runtimeApiUrl;
    this.verbose = options.verbose;
  }

  /**
   * Start the user's function process using tsx watch.
   */
  public async start(): Promise<void> {
    if (this.process) {
      throw new Error("Process is already running");
    }

    if (this.verbose) {
      console.log(chalk.gray(`Starting runtime process...`));
      console.log(
        chalk.gray(
          `  Command: tsx watch --clear-screen=false ${this.entrypoint}`,
        ),
      );
      console.log(chalk.gray(`  Working directory: ${process.cwd()}`));
      console.log(chalk.gray(`  Runtime API: ${this.runtimeApiUrl}`));
    }

    const createdRequire = createRequire(import.meta.url);
    const tsxCli = createdRequire.resolve("tsx/cli");

    const args = ["watch", "--clear-screen=false", this.entrypoint];

    // Spawn tsx watch with the user's entrypoint
    this.process = spawn(process.execPath, [tsxCli, ...args], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        AWS_LAMBDA_RUNTIME_API: this.runtimeApiUrl,
        BB_FUNCTIONS_PHASE: "runtime",
        NODE_ENV: "local",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Handle stdout
    this.process.stdout?.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          console.log(chalk.blue("[Runtime]"), line);
        }
      });
    });

    // Handle stderr
    this.process.stderr?.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          // Check if it's a tsx watch message
          if (line.includes("Watching for file changes")) {
            console.log(chalk.green("✓ Runtime watching for file changes"));
          } else if (line.includes("Restarting")) {
            console.log(
              chalk.yellow("↻ Runtime restarting due to file change..."),
            );
          } else {
            console.error(chalk.red("[Runtime Error]"), line);
          }
        }
      });
    });

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      if (!this.isShuttingDown) {
        if (code !== 0) {
          console.error(
            chalk.red(
              `✗ Runtime process exited unexpectedly with code ${code}`,
            ),
          );
          if (signal) {
            console.error(chalk.red(`  Signal: ${signal}`));
          }
        } else {
          console.log(chalk.gray("Runtime process exited"));
        }
        this.process = null;
      }
    });

    // Handle process errors
    this.process.on("error", (error) => {
      if ((error as Error & { code: string }).code === "ENOENT") {
        console.error(
          chalk.red("✗ Failed to start runtime: tsx not found"),
          chalk.yellow(
            "\n  Make sure tsx is installed: npm install -g tsx or pnpm add tsx",
          ),
        );
      } else {
        console.error(chalk.red("✗ Failed to start runtime process:"), error);
      }
      this.process = null;
    });

    // Give the process a moment to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!this.process || this.process.exitCode !== null) {
      throw new Error("Failed to start runtime process");
    }

    console.log(chalk.green("✓ Runtime process started"));
  }

  /**
   * Stop the user's function process.
   */
  public async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.isShuttingDown = true;

    if (this.verbose) {
      console.log(chalk.gray("Stopping runtime process..."));
    }

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      // Set a timeout to force kill if graceful shutdown fails
      const killTimeout = setTimeout(() => {
        if (this.process) {
          console.log(chalk.yellow("⚠️  Force killing runtime process"));
          try {
            process.kill(-this.process.pid!, "SIGKILL");
          } catch {
            this.process.kill("SIGKILL");
          }
        }
      }, 5000);

      this.process.on("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        console.log(chalk.green("✓ Runtime process stopped"));
        resolve();
      });

      // Kill the entire process group (negative PID) so tsx watch's
      // children are also cleaned up. Falls back to direct kill if
      // the process group kill fails.
      try {
        process.kill(-this.process.pid!, "SIGTERM");
      } catch {
        this.process.kill("SIGTERM");
      }
    });
  }

  /**
   * Check if the process is currently running.
   */
  public isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }
}
