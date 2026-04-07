import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { startRemoteConsoleServer } from '../remote-console.ts';
import type { RemoteConsoleServerLifecycle } from '../server/remote-console-server.types.ts';

/**
 * RemoteConsoleServer Test Graph:
 * └── startRemoteConsoleServer()
 *     ├── should print one normalized stdout line per remote log entry
 *     ├── should dispatch logs and disconnect through single endpoint
 *     ├── should run controlled shutdown once on disconnect
 *     └── should keep process alive after malformed requests
 */
describe('startRemoteConsoleServer', () => {
  let server: RemoteConsoleServerLifecycle | null;
  let stdoutLines: string[];
  let exitCodes: number[];

  beforeEach(() => {
    // START_BEFORE_EACH_ARRANGE_RUNTIME_STATE
    server = null;
    stdoutLines = [];
    exitCodes = [];
    // END_BEFORE_EACH_ARRANGE_RUNTIME_STATE
  });

  afterEach(async () => {
    // START_AFTER_EACH_ACT_SERVER_CLOSE
    if (server) {
      await server.close();
      server = null;
    }
    // END_AFTER_EACH_ACT_SERVER_CLOSE
  });

  it('should print one normalized stdout line per remote log entry', async () => {
    // START_SERVER_STDOUT_LINES_ARRANGE_RUNTIME
    server = await startRemoteConsoleServer({
      port: 0,
      stdoutWrite: (line) => stdoutLines.push(line),
      exit: (code) => exitCodes.push(code),
    });
    // END_SERVER_STDOUT_LINES_ARRANGE_RUNTIME

    // START_SERVER_STDOUT_LINES_ACT
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'logs',
        items: [
          {
            level: 'log',
            timestamp: Date.now(),
            args: [{ kind: 'primitive', text: 'one' }],
          },
          {
            level: 'error',
            timestamp: Date.now(),
            args: [
              { kind: 'primitive', text: 'two' },
              { kind: 'tagged', tag: '[object Error]', text: 'Error: boom' },
            ],
          },
        ],
      }),
    });
    // END_SERVER_STDOUT_LINES_ACT

    // START_SERVER_STDOUT_LINES_ASSERT
    assert.deepStrictEqual(
      {
        status: response.status,
        stdoutLines,
      },
      {
        status: 202,
        stdoutLines: ['[console.log] one', '[console.error] two Error: boom'],
      }
    );
    // END_SERVER_STDOUT_LINES_ASSERT
  });

  it('should dispatch logs and disconnect through single endpoint', async () => {
    // START_SERVER_SINGLE_ENDPOINT_ARRANGE_RUNTIME
    server = await startRemoteConsoleServer({
      port: 0,
      stdoutWrite: (line) => stdoutLines.push(line),
      exit: (code) => exitCodes.push(code),
    });
    // END_SERVER_SINGLE_ENDPOINT_ARRANGE_RUNTIME

    // START_SERVER_SINGLE_ENDPOINT_ACT
    const logsResponse = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'logs',
        items: [
          {
            level: 'info',
            timestamp: Date.now(),
            args: [{ kind: 'primitive', text: 'hello' }],
          },
        ],
      }),
    });
    const disconnectResponse = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'disconnect' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // END_SERVER_SINGLE_ENDPOINT_ACT

    // START_SERVER_SINGLE_ENDPOINT_ASSERT
    assert.deepStrictEqual(
      {
        logsStatus: logsResponse.status,
        disconnectStatus: disconnectResponse.status,
        stdoutLines,
        exitCodes,
      },
      {
        logsStatus: 202,
        disconnectStatus: 202,
        stdoutLines: ['[console.info] hello'],
        exitCodes: [0],
      }
    );
    server = null;
    // END_SERVER_SINGLE_ENDPOINT_ASSERT
  });

  it('should run controlled shutdown once on disconnect', async () => {
    // START_SERVER_SINGLE_SHUTDOWN_ARRANGE_RUNTIME
    server = await startRemoteConsoleServer({
      port: 0,
      exitCode: 9,
      stdoutWrite: (line) => stdoutLines.push(line),
      exit: (code) => exitCodes.push(code),
    });
    // END_SERVER_SINGLE_SHUTDOWN_ARRANGE_RUNTIME

    // START_SERVER_SINGLE_SHUTDOWN_ACT
    await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'disconnect' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'disconnect' }),
      });
    } catch {
      // Server is already closed; second request cannot start another shutdown sequence.
    }
    // END_SERVER_SINGLE_SHUTDOWN_ACT

    // START_SERVER_SINGLE_SHUTDOWN_ASSERT
    assert.deepStrictEqual(exitCodes, [9]);
    server = null;
    // END_SERVER_SINGLE_SHUTDOWN_ASSERT
  });

  it('should keep process alive after malformed requests', async () => {
    // START_SERVER_INVALID_REQUEST_ARRANGE_RUNTIME
    server = await startRemoteConsoleServer({
      port: 0,
      stdoutWrite: (line) => stdoutLines.push(line),
      exit: (code) => exitCodes.push(code),
    });
    // END_SERVER_INVALID_REQUEST_ARRANGE_RUNTIME

    // START_SERVER_INVALID_REQUEST_ACT
    const invalidJsonResponse = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    });
    const invalidCommandResponse = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'unknown' }),
    });
    const validResponse = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'logs',
        items: [
          {
            level: 'warn',
            timestamp: Date.now(),
            args: [{ kind: 'primitive', text: 'still-alive' }],
          },
        ],
      }),
    });
    // END_SERVER_INVALID_REQUEST_ACT

    // START_SERVER_INVALID_REQUEST_ASSERT
    assert.deepStrictEqual(
      {
        invalidJsonStatus: invalidJsonResponse.status,
        invalidCommandStatus: invalidCommandResponse.status,
        validStatus: validResponse.status,
        stdoutLines,
        exitCodes,
      },
      {
        invalidJsonStatus: 400,
        invalidCommandStatus: 400,
        validStatus: 202,
        stdoutLines: ['[console.warn] still-alive'],
        exitCodes: [],
      }
    );
    // END_SERVER_INVALID_REQUEST_ASSERT
  });
});
