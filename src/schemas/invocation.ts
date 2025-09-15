import z from "zod";

export const FunctionInvocationContextInvocationDetails = z.object({
  id: z.string(),
});

export type FunctionInvocationContextInvocationDetails = z.infer<
  typeof FunctionInvocationContextInvocationDetails
>;

export const FunctionInvocationContextSessionDetails = z.object({
  id: z.string(),
  connectUrl: z.string(),
});

export type FunctionInvocationContextSessionDetails = z.infer<
  typeof FunctionInvocationContextSessionDetails
>;

export const FunctionInvocationContext = z.object({
  invocation: FunctionInvocationContextInvocationDetails,
  session: FunctionInvocationContextSessionDetails,
});

export type FunctionInvocationContext = z.infer<
  typeof FunctionInvocationContext
>;
