import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deleteFunction } from "./index.js";

describe("deleteFunction", () => {
  it("sends an authenticated, encoded DELETE and preserves the result", async () => {
    const requests: Array<{
      apiKey: string | null;
      method: string;
      url: string;
    }> = [];
    const responses = [true, false];
    const fetchImplementation: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        apiKey: headers.get("x-bb-api-key"),
        method: init?.method ?? "GET",
        url: String(input),
      });
      return Response.json({ deleted: responses.shift() });
    };

    const options = {
      apiKey: "test-key",
      baseUrl: "https://functions.test",
      fetch: fetchImplementation,
      functionId: "fn/with?reserved#characters",
    };
    assert.deepEqual(await deleteFunction(options), { deleted: true });
    assert.deepEqual(await deleteFunction(options), { deleted: false });
    assert.deepEqual(requests, [
      {
        apiKey: "test-key",
        method: "DELETE",
        url: "https://functions.test/v1/functions/fn%2Fwith%3Freserved%23characters",
      },
      {
        apiKey: "test-key",
        method: "DELETE",
        url: "https://functions.test/v1/functions/fn%2Fwith%3Freserved%23characters",
      },
    ]);
  });

  it("requires an API key", async () => {
    await assert.rejects(
      deleteFunction({ env: {}, functionId: "fn_123" }),
      /Missing Browserbase API key/,
    );
  });

  it("reports unsuccessful API responses", async () => {
    await assert.rejects(
      deleteFunction({
        apiKey: "test-key",
        fetch: async () => new Response("not allowed", { status: 403 }),
        functionId: "fn_123",
      }),
      /not allowed/,
    );
  });
});
