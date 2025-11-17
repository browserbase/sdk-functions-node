import { spawn, ChildProcess } from "child_process";
import { dirname } from "path";
import chalk from "chalk";

export interface ProcessManagerOptions {
  entrypoint: string;
  runtimeApiUrl: string;
  verbose: boolean;
}

/**
 * Manages the lifecycle of the user's function process.
 * Spawns tsx watch to enable hot reloading during development.
 */
export class ProcessManager {
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

    const workingDirectory = dirname(this.entrypoint);

    if (this.verbose) {
      console.log(chalk.gray(`Starting runtime process...`));
      console.log(chalk.gray(`  Command: tsx watch --clear-screen=false ${this.entrypoint}`));
      console.log(chalk.gray(`  Working directory: ${workingDirectory}`));
      console.log(chalk.gray(`  Runtime API: ${this.runtimeApiUrl}`));
    }

    // Spawn tsx watch with the user's entrypoint
    this.process = spawn("tsx", ["watch", "--clear-screen=false", this.entrypoint], {
      cwd: workingDirectory,
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
      if ((error as any).code === "ENOENT") {
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
          this.process.kill("SIGKILL");
        }
      }, 5000);

      this.process.on("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        console.log(chalk.green("✓ Runtime process stopped"));
        resolve();
      });

      // Try graceful shutdown first
      this.process.kill("SIGTERM");
    });
  }

  /**
   * Check if the process is currently running.
   */
  public isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }
}

