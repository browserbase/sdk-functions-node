import z from "zod";

export const FunctionInvocationContextSessionDetails = z.object({
  id: z.string(),
  connectUrl: z.string(),
});

export type FunctionInvocationContextSessionDetails = z.infer<
  typeof FunctionInvocationContextSessionDetails
>;

export const FunctionInvocationContext = z.object({
  session: FunctionInvocationContextSessionDetails,
});

export type FunctionInvocationContext = z.infer<
  typeof FunctionInvocationContext
>;
