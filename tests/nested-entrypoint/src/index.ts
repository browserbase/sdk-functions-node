import { chromium } from "playwright-core";
import * as z from "zod";
import { defineFn } from "@browserbasehq/sdk-functions-node-dev";

const ApiResponseSchema = z.object({
  $id: z.string(),
  currentDateTime: z.string().nullable(),
  utcOffset: z.string().nullable(),
  isDayLightSavingsTime: z.boolean(),
  dayOfTheWeek: z.string().nullable(),
  timeZoneName: z.string().nullable(),
  currentFileTime: z.number(),
  ordinalDate: z.string().nullable(),
  serviceResponse: z.string().nullable(),
});

defineFn(
  "nested-entrypoint",
  async (context, params) => {
    const { session } = context;

    console.log("Function invoked with browser session:");
    console.log("  Session ID:", session.id);
    console.log("  Connect URL:", session.connectUrl);

    const browser = await chromium.connectOverCDP(session.connectUrl);
    const browserContext = browser.contexts()[0];
    const page = browserContext.pages()[0];

    try {
      await page.goto(
        `http://worldclockapi.com/api/json/${(params as { timezone: string }).timezone}/now`,
      );
    } catch (error: unknown) {
      console.warn(error, "Received error going to contact page");
    }

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
