// Black-box e2e: the PRODUCTION OpenCodeReal adapter (through @opencode-ai/sdk over its
// default global fetch) runs unchanged; only the network is faked at the undici layer. The
// SDK believes it is talking to a real `opencode serve` on baseUrl. Proves the OpenCode RPC
// surface (session.create / prompt / message) is fakeable at the network tier — no spawned
// binary, no live LLM. Complements the port-fake tier (OpenCodeMock) with a real-adapter path.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockAgent } from '#utils/test/mock-http.ts';
import { OpenCodeReal } from '../opencode.real.ts';

const BASE = 'http://opencode.test';

/** The assistant-message envelope session.prompt returns (info + parts). */
function assistantReply(parts: Array<{ type: 'text'; text: string }>) {
  return { info: { id: 'msg_1', role: 'assistant' }, parts };
}

describe('OpenCodeReal (black-box over intercepted network)', () => {
  let mockEnv: ReturnType<typeof setupMockAgent>;

  beforeEach(() => {
    mockEnv = setupMockAgent();
  });

  afterEach(() => {
    mockEnv.cleanup();
  });

  it('should create a session and return a handle with the server-assigned id', async () => {
    mockEnv.interceptOnce('POST', `${BASE}/session`, {
      status: 200,
      body: { id: 'ses_create', title: 'review !164', directory: '/wt/messenger' },
    });

    const oc = new OpenCodeReal({ baseUrl: BASE });
    const handle = await oc.createSession({ title: 'review !164', directory: '/wt/messenger' });

    assert.strictEqual(handle.sid, 'ses_create');
    assert.strictEqual(handle.title, 'review !164');
    assert.strictEqual(handle.status, 'idle');
  });

  it('should return plain text output when no format schema is requested', async () => {
    mockEnv.interceptOnce('POST', `${BASE}/session`, {
      status: 200,
      body: { id: 'ses_text', title: 't', directory: '/wt' },
    });
    // The mock backend inspects the prompt body to confirm the system text arrived.
    mockEnv.interceptOnce('POST', `${BASE}/session/ses_text/message`, (req) => {
      assert.match(req.body ?? '', /lens-directive/);
      return { status: 200, body: assistantReply([{ type: 'text', text: 'looks good to me' }]) };
    });

    const oc = new OpenCodeReal({ baseUrl: BASE });
    const { sid } = await oc.createSession({ title: 't' });
    const result = await oc.prompt(sid, { system: 'lens-directive', text: 'review this diff' });

    assert.strictEqual(result.ok, true);
    assert.ok(result.ok && result.output.text === 'looks good to me');
  });

  it('should extract and schema-validate structured JSON from a fenced code block', async () => {
    mockEnv.interceptOnce('POST', `${BASE}/session`, {
      status: 200,
      body: { id: 'ses_json', title: 't', directory: '/wt' },
    });
    const verdict = { verdict: 'approve', findings: [] as unknown[] };
    mockEnv.interceptOnce('POST', `${BASE}/session/ses_json/message`, {
      status: 200,
      body: assistantReply([
        {
          type: 'text',
          text: `Here is my synthesis:\n\n\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``,
        },
      ]),
    });

    const oc = new OpenCodeReal({ baseUrl: BASE });
    const { sid } = await oc.createSession({ title: 't' });
    const result = await oc.prompt(sid, {
      text: 'synthesize',
      format: {
        schema: {
          type: 'object',
          properties: { verdict: { type: 'string' }, findings: { type: 'array' } },
          required: ['verdict'],
        },
      },
    });

    assert.strictEqual(result.ok, true);
    assert.ok(result.ok && result.output.verdict === 'approve');
  });

  it('should classify an assistant-level MessageAbortedError as a SESSION_ERROR result', async () => {
    mockEnv.interceptOnce('POST', `${BASE}/session`, {
      status: 200,
      body: { id: 'ses_err', title: 't', directory: '/wt' },
    });
    mockEnv.interceptOnce('POST', `${BASE}/session/ses_err/message`, {
      status: 200,
      body: {
        info: { id: 'm', role: 'assistant', error: { name: 'MessageAbortedError' } },
        parts: [],
      },
    });

    const oc = new OpenCodeReal({ baseUrl: BASE });
    const { sid } = await oc.createSession({ title: 't' });
    const result = await oc.prompt(sid, { text: 'go' });

    assert.strictEqual(result.ok, false);
    assert.ok(!result.ok && result.error.class === 'SESSION_ERROR');
  });
});
