import archiver from "archiver";
import chalk from "chalk";
import * as path from "node:path";
import * as fs from "node:fs";

interface ArchiveResult {
  buffer: Buffer;
  size: number;
  fileCount: number;
}

function loadGitignorePatterns(workingDirectory: string): string[] {
  const gitignorePath = path.join(workingDirectory, ".gitignore");
  const defaultPatterns = [
    "node_modules/**",
    ".git/**",
    ".env",
    ".env.*",
    "*.log",
    ".DS_Store",
    "dist/**",
    "build/**",
    "*.zip",
    "*.tar",
    "*.tar.gz",
    ".vscode/**",
    ".idea/**",
  ];

  if (!fs.existsSync(gitignorePath)) {
    return defaultPatterns;
  }

  try {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    const patterns = gitignoreContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((pattern) => {
        // Convert gitignore patterns to glob patterns for archiver
        if (pattern.endsWith("/")) {
          return `${pattern}**`;
        }
        return pattern;
      });

    return [...defaultPatterns, ...patterns];
  } catch (error: unknown) {
    console.warn(
      chalk.yellow(
        error,
        "Warning: Could not read .gitignore file, using defaults",
      ),
    );
    return defaultPatterns;
  }
}

export async function createArchive(
  workingDirectory: string,
  options?: {
    dryRun?: boolean;
  },
): Promise<ArchiveResult> {
  return new Promise((resolve, reject) => {
    console.log(chalk.cyan("Creating archive..."));

    const archive = archiver("tar", {
      gzip: true,
      gzipOptions: { level: 9 }, // Maximum compression
    });

    const chunks: Buffer[] = [];
    let fileCount = 0;

    // Collect archive data in memory
    archive.on("data", (chunk) => {
      chunks.push(chunk);
    });

    // Track files being added
    archive.on("entry", (entry) => {
      if (!entry.stats?.isDirectory()) {
        fileCount++;
        if (options?.dryRun) {
          const relativePath = path.relative(workingDirectory, entry.name);
          console.log(chalk.gray(`  + ${relativePath}`));
        }
      }
    });

    archive.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const sizeInMB = (buffer.length / (1024 * 1024)).toFixed(2);

      console.log(
        chalk.green(`✓ Archive created: ${fileCount} files, ${sizeInMB} MB`),
      );

      resolve({
        buffer,
        size: buffer.length,
        fileCount,
      });
    });

    archive.on("error", (err) => {
      console.error(chalk.red(`Archive error: ${err.message}`));
      reject(err);
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn(chalk.yellow(`Warning: ${err.message}`));
      } else {
        reject(err);
      }
    });

    // Get ignore patterns
    const ignorePatterns = loadGitignorePatterns(workingDirectory);

    if (options?.dryRun) {
      console.log(chalk.gray("\nIgnoring patterns:"));
      ignorePatterns.forEach((pattern) => {
        console.log(chalk.gray(`  - ${pattern}`));
      });
      console.log(chalk.gray("\nIncluding files:"));
    }

    // Add directory contents with ignore patterns
    archive.glob("**/*", {
      cwd: workingDirectory,
      ignore: ignorePatterns,
      dot: true, // Include dotfiles (except those in ignore patterns)
      follow: false, // Don't follow symlinks
    });

    // Finalize the archive
    archive.finalize();
  });
}

export function validateArchiveSize(
  size: number,
  maxSizeMB: number = 50,
): void {
  const sizeInMB = size / (1024 * 1024);
  if (sizeInMB > maxSizeMB) {
    console.error(
      chalk.red(
        `Error: Archive size (${sizeInMB.toFixed(
          2,
        )} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
      ),
    );
    console.log(
      chalk.gray(
        "Consider adding more patterns to .gitignore to reduce archive size",
      ),
    );
    process.exit(1);
  }
}
