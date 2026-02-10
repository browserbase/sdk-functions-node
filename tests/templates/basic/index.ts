import { defineFn } from "@browserbasehq/sdk-functions";

defineFn("sdk-e2e-basic", async () => {
  return { answer: "adam is cool" };
});
