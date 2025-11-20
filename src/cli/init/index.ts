import { execSync } from "child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface InitOptions {
  projectName: string;
  packageManager?: "npm" | "pnpm";
}

export async function init(options: InitOptions) {
  // Validate project name
  if (!isValidProjectName(options.projectName)) {
    throw new Error(
      `Invalid project name "${options.projectName}". Project names must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
    );
  }

  const targetDir = resolve(process.cwd(), options.projectName);

  // Check if directory already exists
  if (existsSync(targetDir)) {
    throw new Error(
      `Directory "${options.projectName}" already exists. Please choose a different name or delete the existing directory.`,
    );
  }

  console.log(
    chalk.cyan(
      `🚀 Creating new Browserbase Functions project: ${chalk.bold(options.projectName)}`,
    ),
  );

  // Create the project directory
  mkdirSync(targetDir, { recursive: true });

  try {
    // Step 1: Check prerequisites
    checkPrerequisites();

    // Step 2: Initialize git repository
    if (!existsSync(join(targetDir, ".git"))) {
      console.log(chalk.gray("Initializing git repository..."));
      execSync("git init", { cwd: targetDir, stdio: "pipe" });
      console.log(chalk.green("✓ Git repository initialized"));
    } else {
      console.log(chalk.yellow("✓ Git repository already exists"));
    }

    // Step 3: Initialize package.json
    if (!existsSync(join(targetDir, "package.json"))) {
      console.log(chalk.gray("Creating package.json..."));
      execSync("pnpm init", { cwd: targetDir, stdio: "pipe" });
      console.log(chalk.green("✓ package.json created"));
    } else {
      console.log(chalk.yellow("✓ package.json already exists"));
    }

    // Step 4: Detect and update package manager
    const packageManager = detectPackageManager(options.packageManager);
    updatePackageManager(targetDir, packageManager);

    // Step 5: Install dependencies
    console.log(chalk.gray("Installing dependencies..."));
    installDependencies(targetDir, packageManager);
    console.log(chalk.green("✓ Dependencies installed"));

    // Step 6: Create .env file
    createEnvFile(targetDir);

    // Step 7: Initialize TypeScript configuration
    if (!existsSync(join(targetDir, "tsconfig.json"))) {
      console.log(chalk.gray("Initializing TypeScript configuration..."));
      execSync(`${packageManager === "pnpm" ? "pnpm" : "npx"} tsc --init`, {
        cwd: targetDir,
        stdio: "pipe",
      });

      // Update tsconfig.json with recommended settings
      updateTsConfig(targetDir);
      console.log(chalk.green("✓ TypeScript configuration created"));
    } else {
      console.log(chalk.yellow("✓ TypeScript configuration already exists"));
    }

    // Step 8: Create starter function
    createStarterFunction(targetDir);

    // Success message
    console.log("");
    console.log(chalk.green.bold("✨ Project initialized successfully!"));
    console.log("");
    console.log(chalk.cyan("Next steps:"));
    console.log(chalk.gray("1. Navigate to your project:"));
    console.log(chalk.white(`   cd ${options.projectName}`));
    console.log(
      chalk.gray("2. Add your Browserbase API key and project ID to .env"),
    );
    console.log(chalk.gray("3. Run your function locally:"));
    console.log(
      chalk.white(
        `   ${packageManager === "pnpm" ? "pnpm" : "npx"} bb dev index.ts`,
      ),
    );
    console.log(chalk.gray("4. When ready, publish your function:"));
    console.log(
      chalk.white(
        `   ${packageManager === "pnpm" ? "pnpm" : "npx"} bb publish index.ts`,
      ),
    );
    console.log("");
    console.log(chalk.gray("Learn more at https://browserbase.com/docs"));
  } catch (error) {
    console.error(
      chalk.red("❌ Initialization failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

function checkPrerequisites() {
  const requiredCommands = [
    { command: "node --version", name: "Node.js" },
    { command: "pnpm --version", name: "pnpm" },
    { command: "git --version", name: "git" },
  ];

  for (const { command, name } of requiredCommands) {
    try {
      execSync(command, { stdio: "pipe" });
    } catch {
      throw new Error(
        `${name} is not installed. Please install ${name} and try again.`,
      );
    }
  }
}

function detectPackageManager(preferred?: "npm" | "pnpm"): "npm" | "pnpm" {
  if (preferred) {
    return preferred;
  }

  // Check if running via pnpm dlx
  const userAgent = process.env["npm_config_user_agent"];
  if (userAgent && userAgent.includes("pnpm")) {
    return "pnpm";
  }

  // Default to pnpm since it's required anyway
  return "pnpm";
}

function updatePackageManager(
  targetDir: string,
  packageManager: "npm" | "pnpm",
) {
  const packageJsonPath = join(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  // Get the version of the package manager
  let version: string;
  try {
    if (packageManager === "pnpm") {
      version = execSync("pnpm --version", { stdio: "pipe" }).toString().trim();
      packageJson.packageManager = `pnpm@${version}`;
    } else {
      version = execSync("npm --version", { stdio: "pipe" }).toString().trim();
      packageJson.packageManager = `npm@${version}`;
    }
  } catch {
    // If we can't get the version, use a recent stable version
    packageJson.packageManager =
      packageManager === "pnpm" ? "pnpm@9.0.0" : "npm@10.0.0";
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log(
    chalk.green(`✓ Package manager set to ${packageJson.packageManager}`),
  );
}

function installDependencies(
  targetDir: string,
  packageManager: "npm" | "pnpm",
) {
  const installCmd = packageManager === "pnpm" ? "pnpm add" : "npm install";
  const installDevCmd =
    packageManager === "pnpm" ? "pnpm add -D" : "npm install --save-dev";

  // Install regular dependencies
  console.log(chalk.gray("  Installing @browserbasehq/sdk-functions..."));
  execSync(`${installCmd} @browserbasehq/sdk-functions`, {
    cwd: targetDir,
    stdio: "pipe",
  });

  console.log(chalk.gray("  Installing playwright-core..."));
  execSync(`${installCmd} playwright-core`, {
    cwd: targetDir,
    stdio: "pipe",
  });

  // Install dev dependencies
  console.log(chalk.gray("  Installing TypeScript and type definitions..."));
  execSync(`${installDevCmd} typescript @types/node`, {
    cwd: targetDir,
    stdio: "pipe",
  });
}

function createEnvFile(targetDir: string) {
  const envPath = join(targetDir, ".env");
  if (!existsSync(envPath)) {
    const templatePath = join(__dirname, "templates", ".env.template");
    copyFileSync(templatePath, envPath);
    console.log(chalk.green("✓ .env file created"));
  } else {
    console.log(chalk.yellow("✓ .env file already exists"));
  }
}

function createStarterFunction(targetDir: string) {
  const indexPath = join(targetDir, "index.ts");
  if (!existsSync(indexPath)) {
    const templatePath = join(
      __dirname,
      "templates",
      "starter-function.ts.template",
    );
    copyFileSync(templatePath, indexPath);
    console.log(chalk.green("✓ Starter function created (index.ts)"));
  } else {
    console.log(chalk.yellow("✓ index.ts already exists"));
  }
}

function updateTsConfig(targetDir: string) {
  const tsConfigPath = join(targetDir, "tsconfig.json");

  try {
    const tsConfig = JSON.parse(readFileSync(tsConfigPath, "utf-8"));

    // Update with recommended settings for Browserbase functions
    tsConfig.compilerOptions = {
      ...tsConfig.compilerOptions,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      strict: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    };

    writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  } catch {
    // If we can't parse/update, that's okay - the default tsc --init output will work
    console.log(chalk.yellow("  Using default TypeScript configuration"));
  }
}

function isValidProjectName(name: string): boolean {
  // Project name must start with a letter and contain only letters, numbers, hyphens, and underscores
  const validNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  return validNameRegex.test(name);
}
