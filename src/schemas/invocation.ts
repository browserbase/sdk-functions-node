import z from "zod";

export const FunctionInvocationContextSessionDetails = z
  .object({
    id: z.string(),
    connectUrl: z.string(),
  })
  .loose(); // Allow in additional fields without needing to update the SDK version

export type FunctionInvocationContextSessionDetails = z.infer<
  typeof FunctionInvocationContextSessionDetails
>;

export const FunctionInvocationContext = z
  .object({
    session: FunctionInvocationContextSessionDetails,
  })
  .loose(); // Allow in additional fields without needing to update the SDK version

export type FunctionInvocationContext = z.infer<
  typeof FunctionInvocationContext
>;
