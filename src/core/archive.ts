import archiver from "archiver";
import ignore, { type Ignore } from "ignore";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

import { FunctionsCoreError } from "./errors.js";

export const MAX_FUNCTION_ARCHIVE_SIZE_BYTES = 50 * 1024 * 1024;

const defaultIgnorePatterns = [
  "node_modules/",
  ".git/",
  ".env",
  ".env.*",
  "*.log",
  ".DS_Store",
  "dist/",
  "build/",
  "*.zip",
  "*.tar",
  "*.tar.gz",
  ".vscode/",
  ".idea/",
  ".browserbase/",
];

export interface FunctionArchive {
  buffer: Buffer;
  entries: string[];
  size: number;
}

export async function listFunctionArchiveEntries(
  root: string,
): Promise<string[]> {
  const ignoreMatcher = await loadIgnoreMatcher(root);
  return await listArchiveEntries(root, root, ignoreMatcher);
}

export async function createFunctionArchive(
  root: string,
): Promise<FunctionArchive> {
  const sourceEntries = await listFunctionArchiveEntries(root);
  const { entries, generatedLockfilePath } = ensureArchiveLockfile(
    root,
    sourceEntries,
  );

  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolvePromise, reject) => {
      const archive = archiver("tar", {
        gzip: true,
        gzipOptions: { level: 9 },
      });

      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", resolvePromise);
      archive.on("error", reject);
      archive.on("warning", (warning: Error & { code?: string }) => {
        if (warning.code !== "ENOENT") {
          reject(warning);
        }
      });

      for (const entry of entries) {
        const sourcePath =
          entry === "package-lock.json" && generatedLockfilePath
            ? generatedLockfilePath
            : join(root, entry);
        archive.file(sourcePath, { name: entry });
      }
      archive.finalize().catch(reject);
    });

    const buffer = Buffer.concat(chunks);
    validateFunctionArchiveSize(buffer.length);
    return { buffer, entries, size: buffer.length };
  } finally {
    if (generatedLockfilePath) {
      rmSync(dirname(generatedLockfilePath), { recursive: true, force: true });
    }
  }
}

export function validateFunctionArchiveSize(
  size: number,
  maxSizeBytes: number = MAX_FUNCTION_ARCHIVE_SIZE_BYTES,
): void {
  if (size <= maxSizeBytes) {
    return;
  }
  throw new FunctionsCoreError(
    `Functions archive is ${(size / 1024 / 1024).toFixed(2)} MB; the maximum is ${(maxSizeBytes / 1024 / 1024).toFixed(0)} MB. Add files to .gitignore to reduce its size.`,
    { code: "archive_too_large" },
  );
}

function ensureArchiveLockfile(
  root: string,
  entries: string[],
): { entries: string[]; generatedLockfilePath?: string } {
  if (
    !entries.includes("package.json") ||
    entries.includes("package-lock.json")
  ) {
    return { entries };
  }

  const tempDir = join(tmpdir(), `bb-functions-lockgen-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  copyFileSync(join(root, "package.json"), join(tempDir, "package.json"));

  const result = spawnSync("npm", ["install", "--package-lock-only"], {
    cwd: tempDir,
    stdio: "pipe",
  });

  if (result.error || result.status !== 0) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new FunctionsCoreError(
      "Failed to generate package-lock.json for the Functions build archive.",
      { cause: result.error, code: "package_install_failed" },
    );
  }

  return {
    entries: [...entries, "package-lock.json"].sort(),
    generatedLockfilePath: join(tempDir, "package-lock.json"),
  };
}

async function loadIgnoreMatcher(root: string): Promise<Ignore> {
  const matcher = ignore();
  matcher.add(defaultIgnorePatterns);

  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    matcher.add(readFileSync(gitignorePath, "utf8"));
  }
  return matcher;
}

async function listArchiveEntries(
  root: string,
  current: string,
  matcher: Ignore,
): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    const relativePath = relative(root, absolutePath) || ".";
    const ignorePath = entry.isDirectory() ? `${relativePath}/` : relativePath;
    if (relativePath !== "." && matcher.ignores(ignorePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await listArchiveEntries(root, absolutePath, matcher)));
      continue;
    }
    if ((await stat(absolutePath)).isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}
