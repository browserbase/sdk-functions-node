import { defineFn } from "sdk-functions-node";
import z from "zod";

defineFn(
  "withParamsSchema",
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
