export type FunctionsCoreErrorCode =
  | "archive_too_large"
  | "build_failed"
  | "build_missing_id"
  | "directory_exists"
  | "http_error"
  | "invalid_entrypoint"
  | "invalid_json"
  | "invalid_package_manager"
  | "invalid_port"
  | "invalid_project_name"
  | "invocation_failed"
  | "missing_api_key"
  | "missing_function_id"
  | "package_install_failed"
  | "request_failed"
  | "runtime_start_failed"
  | "timeout";

export interface FunctionsCoreErrorOptions {
  cause?: unknown;
  code: FunctionsCoreErrorCode;
  httpStatus?: number;
  responseBody?: unknown;
}

export class FunctionsCoreError extends Error {
  readonly code: FunctionsCoreErrorCode;
  readonly httpStatus?: number;
  readonly responseBody?: unknown;

  constructor(message: string, options: FunctionsCoreErrorOptions) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "FunctionsCoreError";
    this.code = options.code;
    if (options.httpStatus !== undefined) {
      this.httpStatus = options.httpStatus;
    }
    if (options.responseBody !== undefined) {
      this.responseBody = options.responseBody;
    }
  }
}
