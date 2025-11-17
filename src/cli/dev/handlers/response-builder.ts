import { ServerResponse } from "http";

/**
 * Standard response format for errors
 */
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

/**
 * Standard response format for success
 */
export interface SuccessResponse<T = unknown> {
  status: string;
  data?: T;
}

/**
 * Interface for response building operations
 */
export interface IResponseBuilder {
  /**
   * Send a JSON response with the given status code
   */
  sendJson(res: ServerResponse, statusCode: number, data: unknown): void;

  /**
   * Send a success response
   */
  sendSuccess<T = unknown>(
    res: ServerResponse,
    data?: T,
    statusCode?: number,
  ): void;

  /**
   * Send an error response
   */
  sendError(
    res: ServerResponse,
    error: string,
    statusCode?: number,
    message?: string,
    details?: unknown,
  ): void;

  /**
   * Send a 400 Bad Request error
   */
  sendBadRequest(res: ServerResponse, message: string, details?: unknown): void;

  /**
   * Send a 404 Not Found error
   */
  sendNotFound(res: ServerResponse, message: string): void;

  /**
   * Send a 500 Internal Server Error
   */
  sendInternalError(
    res: ServerResponse,
    message?: string,
    details?: unknown,
  ): void;

  /**
   * Send a 503 Service Unavailable error
   */
  sendServiceUnavailable(res: ServerResponse, message: string): void;

  /**
   * Send a 202 Accepted response
   */
  sendAccepted(res: ServerResponse, data?: unknown): void;
}

/**
 * Response builder implementation
 */
export const responseBuilder: IResponseBuilder = {
  sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  },

  sendSuccess<T = unknown>(
    res: ServerResponse,
    data?: T,
    statusCode: number = 200,
  ): void {
    const response: SuccessResponse<T> = {
      status: "success",
      ...(data !== undefined && { data }),
    };
    this.sendJson(res, statusCode, response);
  },

  sendError(
    res: ServerResponse,
    error: string,
    statusCode: number = 500,
    message?: string,
    details?: unknown,
  ): void {
    const response: ErrorResponse = {
      error,
    };
    if (message) {
      response.message = message;
    }
    if (details) {
      response.details = details;
    }
    this.sendJson(res, statusCode, response);
  },

  sendBadRequest(
    res: ServerResponse,
    message: string,
    details?: unknown,
  ): void {
    this.sendError(res, "Bad Request", 400, message, details);
  },

  sendNotFound(res: ServerResponse, message: string): void {
    this.sendError(res, "Not Found", 404, message);
  },

  sendInternalError(
    res: ServerResponse,
    message: string = "An internal error occurred",
    details?: unknown,
  ): void {
    this.sendError(res, "Internal Server Error", 500, message, details);
  },

  sendServiceUnavailable(res: ServerResponse, message: string): void {
    this.sendError(res, "Service Unavailable", 503, message);
  },

  sendAccepted(res: ServerResponse, data?: unknown): void {
    const response = data || { status: "accepted" };
    this.sendJson(res, 202, response);
  },
};

