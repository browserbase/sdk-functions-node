import z from "zod";
import { FunctionInvocationContext } from "./invocation.js";

export const RuntimeEventPayload = z.object({
  functionName: z.string().min(1),
  params: z.looseObject({}), // Allow passthrough of unknown (all) keys
  context: FunctionInvocationContext,
});

export type RuntimeEventPayload = z.infer<typeof RuntimeEventPayload>;

export const RuntimeEvent = z.object({
  requestId: z.string().min(1),
  event: RuntimeEventPayload,
});

export type RuntimeEvent = z.infer<typeof RuntimeEvent>;

export const RuntimeError = z.object({
  errorMessage: z.string().min(1),
  errorType: z.string().min(1),
  stackTrace: z.array(z.string().min(1)),
});

export type RuntimeError = z.infer<typeof RuntimeError>;
