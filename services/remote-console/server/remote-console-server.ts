// @file: Starts a single-endpoint HTTP runtime that accepts remote log and disconnect envelopes.
// @consumers: remote-console
// @tasks: N/A

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type {
  RemoteConsoleCommandEnvelope,
  RemoteConsoleServerLifecycle,
  RemoteConsoleServerOptions,
} from './remote-console-server.types.ts';
import { RemoteConsoleStdoutWriter } from './remote-console-stdout-writer.ts';

const REMOTE_CONSOLE_ENDPOINT_PATH = '/';

/**
 * @purpose Starts a single-endpoint HTTP runtime that accepts remote log and disconnect envelopes.
 * @param options Runtime startup options with bind address, exit policy and optional test adapters.
 * @throws {Error} When options are invalid or server startup fails.
 * @returns Lifecycle handle exposing resolved endpoint URL and graceful close routine.
 * @sideEffect Network: opens an HTTP listening socket.
 * @sideEffect IO: writes incoming log payloads to stdout via normalized writer.
 */
export async function startRemoteConsoleServer(
  options: RemoteConsoleServerOptions
): Promise<RemoteConsoleServerLifecycle> {
  validateStartOptions(options);

  const host = options.host ?? '127.0.0.1';
  const writer = new RemoteConsoleStdoutWriter(options.stdoutWrite);
  const shutdownController = new RemoteConsoleShutdownController(
    options.exitCode ?? 0,
    options.exit
  );

  const server = createServer((request, response) => {
    void handleRemoteConsoleRequest(request, response, writer, shutdownController, server).catch(
      () => {
        if (!response.writableEnded) {
          respondJson(response, 500, { ok: false, error: 'runtime_failure' });
        }
      }
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const serverAddress = server.address();
  if (!serverAddress || typeof serverAddress === 'string') {
    throw new Error('[startRemoteConsoleServer] Failed to resolve runtime endpoint address');
  }

  return {
    url: `http://${host}:${serverAddress.port}${REMOTE_CONSOLE_ENDPOINT_PATH}`,
    close: async () => {
      await closeServer(server);
    },
  };
}

/**
 * @purpose Validates server startup options before opening sockets.
 * @param options Candidate startup options received from API consumer.
 * @throws {Error} When port is not a finite integer in range 0..65535.
 */
function validateStartOptions(options: RemoteConsoleServerOptions): void {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error('[startRemoteConsoleServer] Invalid port: expected integer in range 0..65535');
  }
}

/**
 * @purpose Handles single-endpoint envelope dispatch for logs and disconnect commands.
 * @param request Node HTTP request object.
 * @param response Node HTTP response object.
 * @param writer Normalized stdout writer.
 * @param shutdownController Controlled shutdown orchestrator.
 * @param server Runtime server instance for shutdown coordination.
 */
async function handleRemoteConsoleRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  writer: RemoteConsoleStdoutWriter,
  shutdownController: RemoteConsoleShutdownController,
  server: Server
): Promise<void> {
  try {
    // Only one endpoint is contractually accepted; route fan-out is intentionally disallowed in first slice.
    if (request.url !== REMOTE_CONSOLE_ENDPOINT_PATH) {
      respondJson(response, 404, { ok: false, error: 'not_found' });
      return;
    }

    if (request.method !== 'POST') {
      respondJson(response, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    const payloadText = await readRequestBody(request);
    let payload: unknown;

    try {
      payload = JSON.parse(payloadText);
    } catch {
      respondJson(response, 400, { ok: false, error: 'invalid_json' });
      return;
    }

    if (!isEnvelope(payload)) {
      respondJson(response, 400, { ok: false, error: 'invalid_envelope' });
      return;
    }

    if (payload.type === 'logs') {
      if (!Array.isArray(payload.items) || payload.items.length === 0) {
        respondJson(response, 400, { ok: false, error: 'invalid_logs_payload' });
        return;
      }

      writer.write(payload.items);
      respondJson(response, 202, { ok: true });
      return;
    }

    if (payload.type === 'disconnect') {
      respondJson(response, 202, { ok: true });
      await shutdownController.begin(server);
      return;
    }

    respondJson(response, 400, { ok: false, error: 'unsupported_command' });
  } catch {
    if (!response.writableEnded) {
      respondJson(response, 500, { ok: false, error: 'runtime_failure' });
    }
  }
}

/**
 * @purpose Determines whether payload shape can be handled as remote-console command envelope.
 * @param payload Parsed JSON body from incoming request.
 * @returns True only when payload contains known command discriminator and required shape.
 */
function isEnvelope(payload: unknown): payload is RemoteConsoleCommandEnvelope {
  // Dispatch safety requires shape guard before branching so malformed requests degrade to 400 instead of runtime throws.
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const payloadType = (payload as { type?: unknown }).type;
  if (payloadType === 'disconnect') {
    return true;
  }

  if (payloadType === 'logs') {
    return Array.isArray((payload as { items?: unknown }).items);
  }

  return false;
}

/**
 * @purpose Reads full HTTP body text for JSON envelope parsing.
 * @param request Incoming request stream.
 * @returns Concatenated UTF-8 body.
 */
async function readRequestBody(request: IncomingMessage): Promise<string> {
  let body = '';

  for await (const chunk of request) {
    body += chunk.toString();
  }

  return body;
}

/**
 * @purpose Sends JSON response with status code and default application/json header.
 * @param response Node response object.
 * @param statusCode HTTP status code.
 * @param payload JSON-serializable response payload.
 */
function respondJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
}

/**
 * @purpose Closes HTTP server and resolves when socket shutdown has completed.
 * @param server Active Node HTTP server instance.
 */
async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

/**
 * @purpose Coordinates idempotent controlled shutdown after disconnect command handling.
 * @consumer RemoteConsoleHttpServer
 */
class RemoteConsoleShutdownController {
  /** @purpose Stores configured exit code used after controlled socket shutdown completes. */
  protected readonly _exitCode: number;
  /** @purpose Stores process-exit strategy (real exit in prod, spy callback in tests). */
  protected readonly _exit: (code: number) => void;
  /** @purpose Prevents duplicate shutdown orchestration across repeated disconnect signals. */
  protected _started = false;

  /** @purpose Initializes controller with deterministic exit behavior for runtime or test harnesses. */
  constructor(exitCode: number, exit?: (code: number) => void) {
    this._exitCode = exitCode;
    this._exit = exit ?? ((code) => process.exit(code));
  }

  /**
   * @purpose Starts shutdown exactly once: close server socket first, then trigger configured exit strategy.
   * @param server Active server runtime instance.
   * @sideEffect Network: stops accepting incoming HTTP connections.
   * @sideEffect Process: triggers exit callback with configured exit code.
   */
  async begin(server: Server): Promise<void> {
    // START_ENSURE_SINGLE_SHUTDOWN_PATH
    // Single disconnect command must own shutdown orchestration to prevent competing close+exit sequences.
    if (this._started) {
      return;
    }

    this._started = true;
    // END_ENSURE_SINGLE_SHUTDOWN_PATH

    try {
      await closeServer(server);
    } finally {
      this._exit(this._exitCode);
    }
  }
}
