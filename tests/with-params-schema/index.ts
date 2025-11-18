import { defineFn } from "@browserbasehq/sdk-functions-node-dev";
import z from "zod";

defineFn(
  "with-params-schema",
  async (_ctx, params) => {
    const x = params.data;
    const returnValue = x * 2;
    return { value: returnValue };
  },
  {
    parametersSchema: z.object({
      data: z.number(),
    }),
  },
);
