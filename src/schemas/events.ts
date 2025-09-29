import z from "zod";
import { FunctionInvocationContext } from "./invocation.js";

export const RuntimeEventPayload = z.object({
  functionName: z.string(),
  params: z.any(),
  context: FunctionInvocationContext,
});

export type RuntimeEventPayload = z.infer<typeof RuntimeEventPayload>;

export const RuntimeEvent = z.object({
  requestId: z.string(),
  event: RuntimeEventPayload,
});

export type RuntimeEvent = z.infer<typeof RuntimeEvent>;

export const RuntimeError = z.object({
  errorMessage: z.string(),
  errorType: z.string(),
  stackTrace: z.array(z.string()),
});

export type RuntimeError = z.infer<typeof RuntimeError>;
