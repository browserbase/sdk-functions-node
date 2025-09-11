import { RuntimeClient } from "./runtime/index.js";
import { runInvocationLoop } from "./runtime/loop.js";
import { FunctionRegistry } from "./runtime/registry.js";
import { EnvironmentManager } from "./utils/env.js";

export { defineFn } from "./define/index.js";

export const environmentManager = new EnvironmentManager(process.env);
export const functionsRegistry = new FunctionRegistry();
export const runtimeClient = new RuntimeClient(
  functionsRegistry,
  environmentManager.runtimeApi,
);

function handleInvocationLoopFailure(error: unknown): void {
  console.error("Received fatal error from invocation loop", error);
  process.exit(1);
}
// We only want to listen for invocations iff we're in the "runtime" phase
if (environmentManager.phase === "runtime") {
  runInvocationLoop(
    runtimeClient,
    handleInvocationLoopFailure,
    environmentManager.environment,
  ).catch((error: unknown) => {
    console.error("Fatal runtime error:", error);
    process.exit(1);
  });
}
