I'm envisioning the following breakdown for the `cli` directory. The CLI is responsible for exposing a `bb dev` command, which does the following:

1. listens for incoming connections on `${BASE_URL}/invocations/next`. When it gets an incoming connection, it accepts and "holds" the connection (doesn't respond) until it gets a request via `/v1/functions/:name/invoke`. When a request comes in on `/v1/functions/:name/invoke`, the `cli` is responsible for completing the request being "held" on `${BASE_URL}/invocations/next` with the data passed in via the `invoke` call (data shape below). When the `cli` resolves the "held" connection, we will call this the "start" of an invocation. The `cli` will "hold" the request via `/v1/functions:name/invoke` until the invocation "completes".
2. after an invocation is "started", the `cli` will wait for a request on `${BASE_URL}/invocations/response` or `${BASE_URL}/invocations/error`. There can only be one "started" invocation at a time. In either case, the `cli` will return a response via the "held" connection via `/v1/functions/:name/invoke` (data shape below).
3. once the invocation "completes", the `cli` will then wait for another call via `${BASE_URL}/invocations/next`, which indicates that the `cli` is "ready" to field another call via `/v1/functions/:name/invoke`.

**shape of incoming "invoke" request:**

```json
{
  "functionName": "SOME_STRING",
  "params": "SOME_JSON_OBJECT",
  "context": {
    "invocation": {
      "id": "SOME_UUID",
      "region": "SOME_STRING"
    },
    "session": {
      "id": "SOME_UUID",
      "connectUrl": "SOME_STRING"
    }
  }
}
```

**shape of response via `/response`:**

```typescript
type FunctionHandlerCallbackReturnValue = JSONObject | void;
```

**shape of error via /error:**

```typescript
{
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(runtimeError),
}
```

# local development

The purpose of `bb dev` is to allow users to locally develop functions as defined in the SDK. I wan the user to need to specify an "entrypoint" which tells the CLI "this is the root of the import tree of all functions". This means the CLI will need to run `tsx watch ENTRYPOINT.ts`. The SDK has a singleton that, when run, will connect to `/invocations/next`.
