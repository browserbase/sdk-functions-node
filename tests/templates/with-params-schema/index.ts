import { defineFn } from "@browserbasehq/sdk-functions";
import z from "zod";

defineFn(
  "sdk-e2e-with-params-schema",
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
