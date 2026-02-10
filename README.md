# Browserbase Functions Node SDK

[![NPM version](https://img.shields.io/npm/v/@browserbasehq/sdk-functions.svg)](https://npmjs.org/package/@browserbasehq/sdk-functions)

The Browserbase Functions SDK lets you define, develop, and deploy serverless browser automation functions on [Browserbase](https://browserbase.com). Each function gets a managed browser session — write your automation logic, test it locally, and publish it to the cloud.

The full documentation can be found on [docs.browserbase.com](https://docs.browserbase.com/functions/quickstart).

## Installation

```sh
pnpm add @browserbasehq/sdk-functions
```

or with npm:

```sh
npm install @browserbasehq/sdk-functions
```

## Quick Start

Scaffold a new project with the CLI:

```sh
pnpm dlx @browserbasehq/sdk-functions init my-project
cd my-project
```

Add your Browserbase credentials to `.env`:

```sh
BROWSERBASE_API_KEY=your_api_key_here
BROWSERBASE_PROJECT_ID=your_project_id_here
```

Start the local development server:

```sh
pnpm bb dev index.ts
```

When ready, publish to Browserbase:

```sh
pnpm bb publish index.ts
```

## Usage

### Basic Function

```ts
import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("hello-world", async () => {
  return { message: "Hello from Browserbase!" };
});
```

### Browser Automation

Every function receives a `context` with a managed browser session. Connect to it with Playwright:

```ts
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("scrape-titles", async (context) => {
  const browser = await chromium.connectOverCDP(context.session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;

  await page.goto("https://news.ycombinator.com");
  const titles = await page.$$eval(".titleline > a", (els) =>
    els.slice(0, 5).map((el) => el.textContent),
  );

  return { titles };
});
```

### Parameter Validation

Use [Zod](https://zod.dev) schemas to validate parameters passed to your function:

```ts
import { defineFn } from "@browserbasehq/sdk-functions";
import z from "zod";

defineFn(
  "multiply",
  async (_context, params) => {
    return { result: params.a * params.b };
  },
  {
    parametersSchema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
);
```

### Custom Browser Configuration

Pass `sessionConfig` to customize the browser session (uses the same options as the [Browserbase SDK session create params](https://docs.browserbase.com/reference/api/create-a-session)):

```ts
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn(
  "stealth-scraper",
  async (context) => {
    const browser = await chromium.connectOverCDP(context.session.connectUrl);
    const page = browser.contexts()[0]!.pages()[0]!;

    await page.goto("https://example.com");
    return { content: await page.textContent("body") };
  },
  {
    sessionConfig: {
      browserSettings: { advancedStealth: true },
    },
  },
);
```

## CLI Reference

The `bb` CLI is included with the package.

| Command                   | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `bb init [project-name]`  | Scaffold a new project (defaults to `my-browserbase-function`) |
| `bb dev <entrypoint>`     | Start a local development server                               |
| `bb publish <entrypoint>` | Deploy your function to Browserbase                            |
| `bb invoke <functionId>`  | Invoke a deployed function                                     |

### `bb init`

```sh
bb init my-project
bb init my-project --package-manager npm
```

Options:

- `-p, --package-manager <manager>` — Package manager to use (`npm` or `pnpm`, defaults to `pnpm`)

### `bb dev`

```sh
bb dev index.ts
bb dev index.ts --port 3000
```

Options:

- `-p, --port <number>` — Port to listen on (default: `14113`)
- `-h, --host <string>` — Host to bind to (default: `127.0.0.1`)

### `bb publish`

```sh
bb publish index.ts
bb publish index.ts --dry-run
```

Options:

- `--dry-run` — Show what would be published without uploading
- `-u, --api-url <url>` — Custom API endpoint URL

### `bb invoke`

```sh
bb invoke <functionId>
bb invoke <functionId> --params '{"key": "value"}'
```

Options:

- `-p, --params <json>` — JSON parameters to pass to the function
- `--no-wait` — Don't wait for the invocation to complete
- `--check-status <invocationId>` — Check the status of an existing invocation
- `-u, --api-url <url>` — Custom API endpoint URL

## Configuration

Set your Browserbase credentials as environment variables or in a `.env` file:

| Variable                 | Required | Description                 |
| ------------------------ | -------- | --------------------------- |
| `BROWSERBASE_API_KEY`    | Yes      | Your Browserbase API key    |
| `BROWSERBASE_PROJECT_ID` | Yes      | Your Browserbase project ID |

Get your API key and project ID from [browserbase.com](https://browserbase.com).

## Requirements

- Node.js 18+
- TypeScript >= 4.5
