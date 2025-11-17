import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import type { PersistedFunctionManifest } from "../../../types/definition.js";
import type { JSONSchemaInput } from "../../../types/schema.js";

/**
 * Interface for managing function manifests
 */
export interface IManifestStore {
  /**
   * Load manifests from the filesystem
   */
  loadManifests(): void;

  /**
   * Get a manifest by function name
   */
  getManifest(functionName: string): PersistedFunctionManifest<JSONSchemaInput> | undefined;

  /**
   * Get the total number of loaded manifests
   */
  getSize(): number;

  /**
   * Check if a manifest exists for the given function name
   */
  hasManifest(functionName: string): boolean;

  /**
   * Get all loaded manifest names
   */
  getManifestNames(): string[];
}

/**
 * Implementation of manifest store for managing function manifests
 */
export class ManifestStore implements IManifestStore {
  private manifests = new Map<string, PersistedFunctionManifest<JSONSchemaInput>>();
  private manifestsPath: string;

  constructor(manifestsPath?: string) {
    this.manifestsPath = manifestsPath || join(
      process.cwd(),
      ".browserbase",
      "functions",
      "manifests",
    );
  }

  /**
   * Load function manifests from the filesystem
   */
  public loadManifests(): void {
    if (!existsSync(this.manifestsPath)) {
      console.log(
        chalk.yellow(`⚠️  No ${this.manifestsPath} directory found`),
      );
      console.log(
        chalk.gray("  Run your entrypoint file first to generate manifests"),
      );
      return;
    }

    try {
      const files = readdirSync(this.manifestsPath);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of jsonFiles) {
        const filePath = join(this.manifestsPath, file);
        const content = readFileSync(filePath, "utf-8");
        const manifest = JSON.parse(
          content,
        ) as PersistedFunctionManifest<JSONSchemaInput>;

        this.manifests.set(manifest.name, manifest);
        console.log(
          chalk.gray(`  Loaded manifest for function: ${manifest.name}`),
        );
      }

      if (this.manifests.size > 0) {
        console.log(
          chalk.green(`✓ Loaded ${this.manifests.size} function manifest(s)`),
        );
      } else {
        console.log(
          chalk.yellow(
            "⚠️  No function manifests found in .browserbase directory",
          ),
        );
      }
    } catch (error) {
      console.error(chalk.red("Failed to load function manifests:"), error);
    }
  }

  /**
   * Get a manifest by function name
   */
  public getManifest(functionName: string): PersistedFunctionManifest<JSONSchemaInput> | undefined {
    return this.manifests.get(functionName);
  }

  /**
   * Get the total number of loaded manifests
   */
  public getSize(): number {
    return this.manifests.size;
  }

  /**
   * Check if a manifest exists for the given function name
   */
  public hasManifest(functionName: string): boolean {
    return this.manifests.has(functionName);
  }

  /**
   * Get all loaded manifest names
   */
  public getManifestNames(): string[] {
    return Array.from(this.manifests.keys());
  }
}