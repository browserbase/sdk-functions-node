import z from "zod";

// Allow in additional fields without needing to update the SDK version
export const FunctionInvocationContextSessionDetails = z.looseObject({
  id: z.string(),
  connectUrl: z.string(),
});

export type FunctionInvocationContextSessionDetails = z.infer<
  typeof FunctionInvocationContextSessionDetails
>;

// Allow in additional fields without needing to update the SDK version
export const FunctionInvocationContext = z.looseObject({
  session: FunctionInvocationContextSessionDetails,
});

export type FunctionInvocationContext = z.infer<
  typeof FunctionInvocationContext
>;
