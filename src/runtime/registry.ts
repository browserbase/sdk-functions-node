import { FunctionNotFoundInRegistryError } from "../utils/errors.js";

import type { FunctionInvocationContext } from "../schemas/invocation.js";
import type { FunctionManifest } from "../types/definition.js";
import type { FunctionHandlerCallbackReturnValue } from "../types/handler.js";
import type { JSONSchemaInput } from "../types/schema.js";

export interface IFunctionRegistry {
  register<S extends JSONSchemaInput>(
    name: FunctionManifest<S>["name"],
    handler: FunctionManifest<S>["handler"],
    config: FunctionManifest<S>["config"],
  ): void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- this would need to be generic based on the `register` call
  getByName(name: string): FunctionManifest<any> | null;

  execute(
    name: string,
    params: object,
    context: FunctionInvocationContext,
  ): Promise<FunctionHandlerCallbackReturnValue>;

  get size(): number;
}

export class FunctionRegistry implements IFunctionRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- this would need to be generic based on the `register` call
  private _functions = new Map<string, FunctionManifest<any>>();

  register<S extends JSONSchemaInput>(
    name: FunctionManifest<S>["name"],
    handler: FunctionManifest<S>["handler"],
    config: FunctionManifest<S>["config"],
  ) {
    this._functions.set(name, {
      name,
      handler,
      config,
    });
  }

  public getByName(name: string): FunctionManifest<unknown> | null {
    return this._functions.get(name) ?? null;
  }

  async execute(
    name: string,
    params: object,
    context: FunctionInvocationContext,
  ) {
    const foundDefinition = this._functions.get(name);
    if (!foundDefinition) {
      throw new FunctionNotFoundInRegistryError(
        `Couldn't find function with name "${name}" in registry`,
      );
    }

    const handlerResult = await foundDefinition.handler(context, params);

    // TODO: Remove when we have a better structured logging story
    console.log("handlerResult", handlerResult);

    return handlerResult;
  }

  get size() {
    return this._functions.size;
  }
}
