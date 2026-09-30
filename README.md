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

Add your Browserbase API key to `.env`:

```sh
BROWSERBASE_API_KEY=your_api_key_here
```

The starter function uses [Stagehand](https://docs.stagehand.dev), which needs its extension in the browser session. Upload the extension then paste the returned `id` into `extensionId` in `index.ts`:

```sh
browse cloud extensions upload node_modules/@browserbasehq/stagehand/dist/assets/stagehand-extension.zip
```

Start the local development server:

```sh
pnpm bb dev index.ts
```

When ready, publish to Browserbase:

```sh
pnpm bb publish index.ts
```

Then [attach your API key as a secret](#secrets) to the published function.

## Usage

### Basic Function

```ts
import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("hello-world", async () => {
  return { message: "Hello from Browserbase!" };
});
```

### Browser Automation

Every function receives a `context` with a managed browser session. Connect [Stagehand](https://docs.stagehand.dev) to it by session ID:

```ts
import { defineFn } from "@browserbasehq/sdk-functions";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

defineFn(
  "scrape-titles",
  async (context) => {
    const browser = await browserbase.connect({
      // The local dev server has no secrets, so fall back to .env.
      apiKey:
        context.secrets.BROWSERBASE_API_KEY ?? process.env.BROWSERBASE_API_KEY!,
      sessionId: context.session.id,
    });
    // In this example, Stagehand uses the Model Gateway where Browserbase charges for the tokens
    const stagehand = await Stagehand.create({ browser });
    const page = (await browser.context.activePage())!;

    await page.goto("https://news.ycombinator.com");
    const { data } = await stagehand.extract(
      "Extract the titles of the top 5 stories",
      z.object({ titles: z.array(z.string()).max(5) }),
    );

    await stagehand.close();
    return { titles: data.titles };
  },
  // The ID from `browse cloud extensions upload`. Stagehand needs its extension in the session.
  { sessionConfig: { extensionId: "your-extension-id" } },
);
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
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

defineFn(
  "stealth-scraper",
  async (context) => {
    const browser = await browserbase.connect({
      apiKey:
        context.secrets.BROWSERBASE_API_KEY ?? process.env.BROWSERBASE_API_KEY!,
      sessionId: context.session.id,
    });
    const stagehand = await Stagehand.create({ browser });
    const page = (await browser.context.activePage())!;

    await page.goto("https://example.com");
    const { data } = await stagehand.extract(
      "Extract the main text of the page",
      z.object({ content: z.string() }),
    );

    await stagehand.close();
    return { content: data.content };
  },
  {
    sessionConfig: {
      extensionId: "your-extension-id", // Stagehand's extension
      browserSettings: { advancedStealth: true },
    },
  },
);
```

### Secrets

Keep API keys in encrypted project secrets. Each secret attached to a function is available as `context.secrets[name]`. The Stagehand examples read `BROWSERBASE_API_KEY` this way. They don't need a model API key: without a `model` option, Stagehand uses the [Browserbase Model Gateway](https://docs.stagehand.dev/v4/configuration/models#model-gateway), which picks a model for each call. Browserbase charges for the tokens.

Create the secret and attach it to the published function with the [`browse` CLI](https://www.npmjs.com/package/browse):

```sh
browse cloud secrets create BROWSERBASE_API_KEY --env BROWSERBASE_API_KEY
browse functions secrets attach <functionId> <secretId>
```

Use the Function ID from `builtFunctions[].id` in the publish output. The local development server doesn't pass secrets, so the examples fall back to the values in `.env`.

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

Set variables in your environment or in a `.env` file for the CLI and the local development server. Deployed functions read them from [secrets](#secrets) instead.

| Variable              | Required | Description              |
| --------------------- | -------- | ------------------------ |
| `BROWSERBASE_API_KEY` | Yes      | Your Browserbase API key |

Get your API key from [browserbase.com](https://browserbase.com).

## Requirements

- Node.js 18+
- TypeScript >= 4.5
