import type { IRuntimeClient } from "./index.js";

export async function waitForAndHandleInvocation(
  runtimeClient: IRuntimeClient,
  handleProductionFailure: (error: unknown) => void,
  environment: string,
) {
  // Any errors caught by this block will be considered fatal system errors
  try {
    const { requestId, event } = await runtimeClient.waitForNextInvocation();
    console.log(`Received invocation with requestId: ${requestId}`);
    const { functionName } = event;

    // Validate that the specified function is in the registry.
    // If not, throw a system error as this means we've set up the DB wrong
    // and that the system thinks that function is here when it's not.
    // NOTE: If the user finds a way to circumvent the SDK setup intentionally,
    // NOTE: we could see this error when the DB is correct.
    const functionDefinition =
      runtimeClient.getFunctionDefinitionByName(functionName);

    console.log(
      `Found definition for "${functionName}": ${JSON.stringify(functionDefinition)}`,
    );

    // TODO: type this error
    if (!functionDefinition) {
      throw new Error(`Function "${functionName}" not found in registry`);
    }

    // Any errors caught by this block will be considered user code errors
    let result;
    try {
      console.log(`Executing function: ${functionName}`);
      result = await runtimeClient.executeFunction(event);
      console.log(`Received result: ${JSON.stringify(result)}`);
    } catch (error: unknown) {
      console.error("Handler error:", error);
      await runtimeClient.handleFailure(requestId, error);
      return; // This invocation is done - don't call handleSuccess
    }

    await runtimeClient.handleSuccess(requestId, result);
    console.log(`Function "${functionName}" completed successfully`);
  } catch (error: unknown) {
    console.error("Fatal error in runtime loop:", error);
    // In production Lambda, this would cause the container to be recycled
    // For development, we'll continue the loop
    if (environment === "production") {
      handleProductionFailure(error);
    }
  }
}

export async function runInvocationLoop(
  runtimeClient: IRuntimeClient,
  handleProductionFailure: (error: unknown) => void,
  environment: string,
): Promise<void> {
  while (true) {
    await waitForAndHandleInvocation(
      runtimeClient,
      handleProductionFailure,
      environment,
    );
  }
}
