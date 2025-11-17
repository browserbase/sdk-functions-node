import { IncomingMessage } from "http";
import { z } from "zod";

/**
 * Interface for request parsing operations
 */
export interface IRequestParser {
  /**
   * Parse JSON body from an incoming request
   */
  parseJsonBody(req: IncomingMessage): Promise<unknown>;

  /**
   * Parse and validate JSON body with a Zod schema
   */
  parseAndValidate<T>(
    req: IncomingMessage,
    schema: z.ZodType<T>
  ): Promise<T>;
}

/**
 * Request parser implementation
 */
export const requestParser: IRequestParser = {
  async parseJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve(parsed);
        } catch (error: unknown) {
          reject(new Error("Invalid JSON body", { cause: error }));
        }
      });

      req.on("error", reject);
    });
  },

  async parseAndValidate<T>(
    req: IncomingMessage,
    schema: z.ZodType<T>
  ): Promise<T> {
    const body = await this.parseJsonBody(req);
    return schema.parse(body);
  }
};