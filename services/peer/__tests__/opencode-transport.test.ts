// @file: Tests for the OpenCode transport HTTP send path against a mock server.
// @spec: PEER
// @consumers: N/A

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { OpenCodeTransport } from '../opencode/opencode.transport.ts';
import type { PeerTarget } from '../peer-port.ts';

let server: Server;
let baseUrl = '';
let lastAuth = '';

before(async () => {
  server = createServer((req, res) => {
    lastAuth = req.headers['authorization'] ?? '';
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.method === 'POST' && req.url?.endsWith('/message')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ parts: [{ type: 'text', text: 'pong' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (typeof address === 'object' && address) baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.GENNADY_OPENCODE_URL = baseUrl;
  process.env.OPENCODE_SERVER_PASSWORD = 'testpass';
  process.env.OPENCODE_SERVER_USERNAME = 'opencode';
});

after(async () => {
  delete process.env.GENNADY_OPENCODE_URL;
  delete process.env.OPENCODE_SERVER_PASSWORD;
  delete process.env.OPENCODE_SERVER_USERNAME;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('opencode call posts to the live HTTP API and returns the reply', async () => {
  const transport = new OpenCodeTransport();
  const target: PeerTarget = {
    runtime: 'opencode',
    id: 'ses_test',
    name: 'Loading 381',
    address: 'opencode:ses_test',
  };
  const reply = await transport.call(target, { kind: 'task', body: 'compute 7*6' });
  assert.equal(reply, 'pong');
  assert.equal(lastAuth, `Basic ${Buffer.from('opencode:testpass').toString('base64')}`);
});

test('opencode transport declares plain synchronous calls', () => {
  const transport = new OpenCodeTransport();
  assert.equal(transport.runtime, 'opencode');
  assert.equal(typeof transport.call, 'function');
});
