import { defineFn } from "@browserbasehq/sdk-functions-node-dev";

defineFn("basic", async () => {
  return { answer: "adam is cool" };
});
