import { defineFn } from "sdk-functions-node";

defineFn("basic", async () => {
  return { answer: "adam is cool" };
});
