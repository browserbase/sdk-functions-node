import type Browserbase from "@browserbasehq/sdk";

import type { FunctionHandler } from "./handler.js";
import type { JSONSchemaInput } from "./schema.js";

export interface FunctionManifest<S extends JSONSchemaInput> {
  name: string;
  handler: FunctionHandler<S>;
  config: FunctionConfiguration<S>;
}

export interface PersistedFunctionManifest<S extends JSONSchemaInput> {
  name: FunctionManifest<S>["name"];
  config: Omit<FunctionManifest<S>["config"], "parametersSchema"> & {
    parametersSchema?: object;
  };
}

export interface FunctionConfiguration<S extends JSONSchemaInput> {
  sessionConfig?: SessionConfiguration;
  parametersSchema?: S;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- allows for future extensibility
export interface SessionConfiguration
  extends Omit<Browserbase.SessionCreateParams, "projectId"> {}
