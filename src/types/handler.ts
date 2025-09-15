import type { FunctionInvocationContext } from "../schemas/invocation.js";

import type { JSONObject } from "./helpers.js";
import type { JSONSchemaInput } from "./schema.js";
import type z from "zod";

export type FunctionHandler<S extends JSONSchemaInput> = (
  params: S extends JSONSchemaInput ? z.infer<S> : unknown,
  context: FunctionInvocationContext,
) =>
  | Promise<FunctionHandlerCallbackReturnValue>
  | FunctionHandlerCallbackReturnValue;

export type FunctionHandlerCallbackReturnValue = JSONObject | void;
