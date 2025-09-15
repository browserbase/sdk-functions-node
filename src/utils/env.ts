export interface IEnvironmentManager {
  get environment(): string;
  get runtimeApi(): string;
  get phase(): string;
}

export class EnvironmentManager {
  /// Whether we're running these locally or deployed ("production").
  /// Locally we are more forgiving on failures, and will change logging.
  private _environment: "local" | "production";

  /// The URL that is used to alert the runtime to the status of the invocation.
  /// Locally this will point to the URL of the dev server being run, in prod this
  /// will point to the runtime's internal endpoints.
  private _runtimeApi: string;

  /// We need to handle running a function differently than we handle
  /// deploying a function. The "runtime" phase is when we're trying to
  /// run a function by name (either locally or in prod). The "build"
  /// phase is when we're generating local manifest files to send to
  /// the Browserbase API. Defaults to runtime phase.
  private _phase: "runtime" | "introspect";

  constructor(processEnv: NodeJS.ProcessEnv) {
    this._environment = getOrDefault<typeof this._environment>(
      processEnv,
      "NODE_ENV",
      "local",
    );

    this._runtimeApi = getOrDefault<typeof this._runtimeApi>(
      processEnv,
      "AWS_LAMBDA_RUNTIME_API",
      "127.0.0.1:9001",
    );

    this._phase = getOrDefault<typeof this._phase>(
      processEnv,
      "BB_FUNCTIONS_PHASE",
      "runtime",
    );
  }

  get environment() {
    return this._environment;
  }

  get runtimeApi() {
    return this._runtimeApi;
  }

  get phase() {
    return this._phase;
  }
}

function getOrDefault<T>(env: NodeJS.ProcessEnv, key: string, dflt: T): T {
  const val = env[key];
  if (!val) {
    return dflt;
  }
  return val as T;
}
