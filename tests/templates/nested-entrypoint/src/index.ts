import { chromium } from "playwright-core";
import * as z from "zod";
import { defineFn } from "@browserbasehq/sdk-functions";

const ApiResponseSchema = z.object({
  userId: z.number(),
  id: z.number(),
  title: z.string(),
  completed: z.boolean(),
});

defineFn(
  "sdk-e2e-nested-entrypoint",
  async (context) => {
    const { session } = context;

    console.log("Function invoked with browser session:");
    console.log("  Session ID:", session.id);
    console.log("  Connect URL:", session.connectUrl);

    const browser = await chromium.connectOverCDP(session.connectUrl);
    const browserContext = browser.contexts()[0];
    const page = browserContext.pages()[0];

    const randomId = Math.floor(Math.random() * 200);
    console.log({ randomId }, "picked random id");

    await page.goto(`https://jsonplaceholder.typicode.com/todos/${randomId}`);

    const pageContent = await page.textContent("body");
    console.log(pageContent, "page content");

    const parsedResponse = ApiResponseSchema.parse(
      JSON.parse(pageContent ?? "invalid"),
    );
    return parsedResponse;
  },
  {
    sessionConfig: {
      browserSettings: { advancedStealth: true },
    },
  },
);
