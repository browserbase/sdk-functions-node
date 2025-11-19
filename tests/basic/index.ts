import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("basic", async () => {
  return { answer: "adam is cool" };
});
