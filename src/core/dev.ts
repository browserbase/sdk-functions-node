import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { FunctionsCoreError } from "./errors.js";
import {
  formatErrorMessage,
  functionsRequest,
  resolveEntrypoint,
  resolveFunctionsApiConfig,
  type FunctionsApiConfig,
  type ResolveFunctionsApiConfigOptions,
} from "./shared.js";

const DEFAULT_RUNTIME_STARTUP_TIMEOUT_MS = 10_000;

export type DevServerLogEvent =
  | { level: "error"; message: string; source: "server" }
  | { level: "error" | "info"; message: string; source: "runtime" }
  | { level: "warn"; message: string; source: "session" };

export interface StartDevServerOptions
  extends ResolveFunctionsApiConfigOptions {
  cwd?: string;
  entrypoint: string;
  host?: string;
  onLog?: (event: DevServerLogEvent) => void;
  port?: number;
  projectId?: string;
  startupTimeoutMs?: number;
  verbose?: boolean;
}

export interface DevServerHandle {
  close(): Promise<void>;
  runtimeConnected: boolean;
  url: string;
}

interface InvocationContext {
  invocation: { id: string; region: "local" };
  session: { id: string; connectUrl: string };
}

interface PendingConnection {
  corsHeaders: Record<string, string>;
  response: ServerResponse;
}

interface FunctionManifest {
  name: string;
  config?: { sessionConfig?: Record<string, unknown> };
}

class InvocationBridge {
  private cleanupSessionCallback:
    | ((sessionId: string) => Promise<void>)
    | null = null;
  private currentRequestId: string | null = null;
  private currentSessionId: string | null = null;
  private invokeConnection: PendingConnection | null = null;
  private nextConnection: PendingConnection | null = null;
  private runtimeConnected = false;

  constructor(private readonly onLog?: (event: DevServerLogEvent) => void) {}

  setCleanupSessionCallback(
    callback: (sessionId: string) => Promise<void>,
  ): void {
    this.cleanupSessionCallback = callback;
  }

  holdNextConnection(
    response: ServerResponse,
    corsHeaders: Record<string, string>,
  ): void {
    this.runtimeConnected = true;
    if (this.nextConnection) {
      this.nextConnection.response.writeHead(503, {
        ...this.nextConnection.corsHeaders,
        "content-type": "application/json",
      });
      this.nextConnection.response.end(
        JSON.stringify({ error: "Another runtime process connected." }),
      );
    }
    this.nextConnection = { corsHeaders, response };
  }

  isRuntimeConnected(): boolean {
    return this.runtimeConnected && this.nextConnection !== null;
  }

  hasActiveInvocation(): boolean {
    return this.invokeConnection !== null;
  }

  async completeWithSuccess(
    requestId: string,
    payload: unknown,
  ): Promise<boolean> {
    if (requestId !== this.currentRequestId || !this.invokeConnection) {
      return false;
    }
    sendJson(
      this.invokeConnection.response,
      200,
      payload ?? {},
      this.invokeConnection.corsHeaders,
    );
    await this.cleanupAndReset();
    return true;
  }

  async completeWithError(
    requestId: string,
    payload: RuntimeError,
  ): Promise<boolean> {
    if (requestId !== this.currentRequestId || !this.invokeConnection) {
      return false;
    }
    sendJson(
      this.invokeConnection.response,
      500,
      {
        error: {
          message: payload.errorMessage,
          stackTrace: payload.stackTrace,
          type: payload.errorType,
        },
      },
      this.invokeConnection.corsHeaders,
    );
    await this.cleanupAndReset();
    return true;
  }

  triggerInvocation(
    functionName: string,
    params: Record<string, unknown>,
    context: InvocationContext,
    corsHeaders: Record<string, string>,
    response: ServerResponse,
  ): boolean {
    if (!this.nextConnection || this.invokeConnection) {
      return false;
    }

    const requestId = randomUUID();
    this.currentRequestId = requestId;
    this.currentSessionId = context.session.id;
    this.invokeConnection = { corsHeaders, response };
    this.nextConnection.response.writeHead(200, {
      ...this.nextConnection.corsHeaders,
      "content-type": "application/json",
      "Lambda-Runtime-Aws-Request-Id": requestId,
      "Lambda-Runtime-Deadline-Ms": String(Date.now() + 300_000),
      "Lambda-Runtime-Invoked-Function-Arn": `arn:aws:lambda:us-east-1:000000000000:function:${functionName}`,
    });
    this.nextConnection.response.end(
      JSON.stringify({ context, functionName, params }),
    );
    this.nextConnection = null;
    return true;
  }

  private async cleanupAndReset(): Promise<void> {
    try {
      if (this.cleanupSessionCallback && this.currentSessionId) {
        await this.cleanupSessionCallback(this.currentSessionId);
      }
    } catch (error) {
      this.onLog?.({
        level: "warn",
        message: `Functions dev session cleanup failed: ${formatErrorMessage(error)}`,
        source: "session",
      });
    } finally {
      this.currentRequestId = null;
      this.currentSessionId = null;
      this.invokeConnection = null;
    }
  }
}

class BrowserSessionManager {
  constructor(
    private readonly config: FunctionsApiConfig,
    private readonly projectId?: string,
  ) {}

  async createSession(
    sessionConfig: Record<string, unknown> = {},
  ): Promise<InvocationContext["session"]> {
    const body: Record<string, unknown> = { ...sessionConfig };
    if (this.projectId !== undefined) {
      body["projectId"] = this.projectId;
    }
    const response = await functionsRequest(this.config, "/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const session = (await response.json()) as {
      id?: string;
      connectUrl?: string;
    };
    if (!session.id || !session.connectUrl) {
      throw new FunctionsCoreError(
        "Browserbase session create completed without returning id and connectUrl.",
        { code: "request_failed", responseBody: session },
      );
    }
    return { connectUrl: session.connectUrl, id: session.id };
  }

  async closeSession(sessionId: string): Promise<void> {
    const body: Record<string, unknown> = { status: "REQUEST_RELEASE" };
    if (this.projectId !== undefined) {
      body["projectId"] = this.projectId;
    }
    await functionsRequest(this.config, `/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

class ManifestStore {
  private readonly manifests = new Map<string, FunctionManifest>();
  private readonly manifestsPath: string;

  constructor(cwd: string) {
    this.manifestsPath = join(cwd, ".browserbase", "functions", "manifests");
  }

  async load(): Promise<void> {
    this.manifests.clear();
    if (!existsSync(this.manifestsPath)) {
      return;
    }
    for (const entry of await readdir(this.manifestsPath)) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      const manifest = JSON.parse(
        await readFile(join(this.manifestsPath, entry), "utf8"),
      ) as FunctionManifest;
      this.manifests.set(manifest.name, manifest);
    }
  }

  get(name: string): FunctionManifest | undefined {
    return this.manifests.get(name);
  }
}

class RuntimeProcess {
  private child: ChildProcess | null = null;

  constructor(
    private readonly cwd: string,
    private readonly entrypoint: string,
    private readonly runtimeApi: string,
    private readonly verbose: boolean,
    private readonly onLog?: (event: DevServerLogEvent) => void,
  ) {}

  async start(): Promise<void> {
    const require = createRequire(import.meta.url);
    const tsxCli = require.resolve("tsx/cli");
    const nodeExecutable =
      "bun" in process.versions ? "node" : process.execPath;
    const child = spawn(
      nodeExecutable,
      [tsxCli, "watch", "--clear-screen=false", this.entrypoint],
      {
        cwd: this.cwd,
        env: {
          ...process.env,
          AWS_LAMBDA_RUNTIME_API: this.runtimeApi,
          BB_FUNCTIONS_PHASE: "runtime",
          NODE_ENV: "local",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) {
        this.onLog?.({
          level: "info",
          message: this.verbose ? `[runtime] ${message}` : message,
          source: "runtime",
        });
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) {
        this.onLog?.({
          level: "error",
          message: this.verbose ? `[runtime:error] ${message}` : message,
          source: "runtime",
        });
      }
    });
    child.once("exit", () => {
      if (this.child === child) {
        this.child = null;
      }
    });

    try {
      await waitForChildSpawn(child);
    } catch (error) {
      this.child = null;
      throw new FunctionsCoreError(
        `Failed to start Functions runtime: ${formatErrorMessage(error)}`,
        { cause: error, code: "runtime_start_failed" },
      );
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.child = null;
      return;
    }
    await new Promise<void>((resolvePromise) => {
      const forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      const finish = () => {
        clearTimeout(forceKillTimer);
        resolvePromise();
      };
      child.once("exit", finish);
      if (!child.kill("SIGTERM")) {
        child.off("exit", finish);
        finish();
      }
    });
    this.child = null;
  }
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<DevServerHandle> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 14_113;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new FunctionsCoreError(
      "Port must be an integer between 1 and 65535.",
      {
        code: "invalid_port",
      },
    );
  }
  const entrypoint = await resolveEntrypoint(options.entrypoint, cwd);
  const config = resolveFunctionsApiConfig(options);
  const bridge = new InvocationBridge(options.onLog);
  const sessionManager = new BrowserSessionManager(config, options.projectId);
  const manifestStore = new ManifestStore(cwd);
  bridge.setCleanupSessionCallback(async (sessionId) => {
    await sessionManager.closeSession(sessionId);
  });

  await mkdir(join(cwd, ".browserbase", "functions", "manifests"), {
    recursive: true,
  });
  const server = await startServer(
    host,
    port,
    bridge,
    manifestStore,
    sessionManager,
    options.onLog,
  );
  const runtime = new RuntimeProcess(
    cwd,
    entrypoint,
    `${host}:${port}`,
    options.verbose ?? false,
    options.onLog,
  );
  try {
    await runtime.start();
    const runtimeConnected = await waitForRuntime(
      bridge,
      manifestStore,
      options.startupTimeoutMs ?? DEFAULT_RUNTIME_STARTUP_TIMEOUT_MS,
    );
    let closed = false;
    return {
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        await runtime.stop();
        await closeServer(server);
      },
      runtimeConnected,
      url: `http://${host}:${port}`,
    };
  } catch (error) {
    await runtime.stop();
    await closeServer(server);
    throw error;
  }
}

async function startServer(
  host: string,
  port: number,
  bridge: InvocationBridge,
  manifestStore: ManifestStore,
  sessionManager: BrowserSessionManager,
  onLog?: (event: DevServerLogEvent) => void,
): Promise<Server> {
  const server = createServer((request, response) => {
    routeRequest(
      request,
      response,
      bridge,
      manifestStore,
      sessionManager,
    ).catch((error) => {
      const message = formatErrorMessage(error);
      onLog?.({
        level: "error",
        message: `Functions dev request failed: ${message}`,
        source: "server",
      });
      if (!response.headersSent && !response.writableEnded) {
        sendJson(response, 500, { error: message }, baseCorsHeaders());
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.listen(port, host, resolvePromise);
    server.on("error", reject);
  });
  return server;
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bridge: InvocationBridge,
  manifestStore: ManifestStore,
  sessionManager: BrowserSessionManager,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "127.0.0.1"}`,
  );
  const path = url.pathname;
  const corsHeaders = corsHeadersForRequest(request);
  if (!corsHeaders) {
    sendForbiddenOrigin(response);
    return;
  }
  if (method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }
  if (method === "GET" && path === "/") {
    sendJson(response, 200, { ok: true }, corsHeaders);
    return;
  }
  if (method === "GET" && path === "/2018-06-01/runtime/invocation/next") {
    bridge.holdNextConnection(response, corsHeaders);
    return;
  }

  const invokeMatch = path.match(/^\/v1\/functions\/([^/]+)\/invoke$/);
  if (method === "POST" && invokeMatch?.[1]) {
    await manifestStore.load();
    const functionName = invokeMatch[1];
    const manifest = manifestStore.get(functionName);
    if (!manifest) {
      sendJson(
        response,
        404,
        {
          error: `Function "${functionName}" was not found in .browserbase/functions/manifests.`,
        },
        corsHeaders,
      );
      return;
    }
    if (bridge.hasActiveInvocation()) {
      sendJson(
        response,
        503,
        { error: "Another invocation is already in progress." },
        corsHeaders,
      );
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendJson(
        response,
        400,
        { error: formatErrorMessage(error) },
        corsHeaders,
      );
      return;
    }
    const params =
      body && typeof body === "object" && !Array.isArray(body)
        ? ((body as { params?: Record<string, unknown> }).params ?? {})
        : {};
    const session = await sessionManager.createSession(
      manifest.config?.sessionConfig,
    );
    const accepted = bridge.triggerInvocation(
      functionName,
      params,
      {
        invocation: { id: randomUUID(), region: "local" },
        session,
      },
      corsHeaders,
      response,
    );
    if (!accepted) {
      await sessionManager.closeSession(session.id);
      sendJson(
        response,
        503,
        { error: "No runtime is connected yet." },
        corsHeaders,
      );
    }
    return;
  }

  const responseMatch = path.match(
    /^\/2018-06-01\/runtime\/invocation\/([^/]+)\/response$/,
  );
  if (method === "POST" && responseMatch?.[1]) {
    const requestId = responseMatch[1];
    let payload: unknown;
    try {
      payload = await readJsonBody(request);
    } catch (error) {
      const message = `Invalid runtime response payload: ${formatErrorMessage(error)}`;
      const completed = await bridge.completeWithError(requestId, {
        errorMessage: message,
        errorType: "RuntimeResponseError",
        stackTrace: [],
      });
      sendJson(
        response,
        400,
        completed ? { error: message } : { error: "Request ID mismatch." },
        corsHeaders,
      );
      return;
    }
    const completed = await bridge.completeWithSuccess(requestId, payload);
    sendJson(
      response,
      completed ? 202 : 400,
      completed ? { ok: true } : { error: "Request ID mismatch." },
      corsHeaders,
    );
    return;
  }

  const errorMatch = path.match(
    /^\/2018-06-01\/runtime\/invocation\/([^/]+)\/error$/,
  );
  if (method === "POST" && errorMatch?.[1]) {
    const requestId = errorMatch[1];
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      body = {
        errorMessage: `Invalid runtime error payload: ${formatErrorMessage(error)}`,
        errorType: "RuntimeResponseError",
        stackTrace: [],
      };
    }
    const payload = body as Partial<RuntimeError>;
    const completed = await bridge.completeWithError(requestId, {
      errorMessage: payload.errorMessage ?? "Unknown runtime error",
      errorType: payload.errorType ?? "RuntimeError",
      stackTrace: Array.isArray(payload.stackTrace) ? payload.stackTrace : [],
    });
    sendJson(
      response,
      completed ? 202 : 400,
      completed ? { ok: true } : { error: "Request ID mismatch." },
      corsHeaders,
    );
    return;
  }

  sendJson(response, 404, { error: "Not found." }, corsHeaders);
}

interface RuntimeError {
  errorMessage: string;
  errorType: string;
  stackTrace: string[];
}

async function waitForRuntime(
  bridge: InvocationBridge,
  manifestStore: ManifestStore,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bridge.isRuntimeConnected()) {
      await manifestStore.load();
      return true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  await manifestStore.load();
  return bridge.isRuntimeConnected();
}

async function waitForChildSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const cleanup = () => {
      child.off("error", onError);
      child.off("spawn", onSpawn);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onSpawn = () => {
      cleanup();
      resolvePromise();
    };
    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : {};
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  corsHeaders: Record<string, string>,
): void {
  response.writeHead(statusCode, {
    ...corsHeaders,
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function sendForbiddenOrigin(response: ServerResponse): void {
  response.writeHead(403, {
    "content-type": "application/json",
    vary: "Origin",
  });
  response.end(JSON.stringify({ error: "Origin is not allowed." }));
}

function corsHeadersForRequest(
  request: IncomingMessage,
): Record<string, string> | null {
  const origin = request.headers.origin;
  if (origin === undefined) {
    return baseCorsHeaders();
  }
  if (Array.isArray(origin) || !isAllowedLoopbackOrigin(origin)) {
    return null;
  }
  return {
    ...baseCorsHeaders(),
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

function baseCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function isAllowedLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
