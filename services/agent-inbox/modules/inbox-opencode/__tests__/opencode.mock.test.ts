// @file: Unit tests for OpenCodeMock — all outcome classes, continue recovery, recovery ladder.
// @consumers: node:test runner
// @tasks: TSK-111

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeMock } from '../opencode.mock.ts';
import type { OutcomeClass, OpenCodeCallResult } from '../errors.ts';

// ── helpers ──

function makeFormat(title: string) {
  return {
    type: 'json_schema' as const,
    schema: { title, type: 'object', properties: {} },
  };
}

function assertOk(result: OpenCodeCallResult): asserts result is OpenCodeCallResult & { ok: true } {
  assert.strictEqual(result.ok, true, `Expected ok=true but got ${JSON.stringify(result)}`);
}

function assertError(
  result: OpenCodeCallResult,
  expectedClass: OutcomeClass
): asserts result is OpenCodeCallResult & { ok: false } {
  assert.strictEqual(result.ok, false, `Expected ok=false for ${expectedClass}`);
  assert.strictEqual(result.error.class, expectedClass);
}

// ── tests ──

describe('OpenCodeMock — session lifecycle', () => {
  it('GIVEN new mock WHEN createSession THEN returns handle with idle status', async () => {
    const mock = new OpenCodeMock();

    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    assert.strictEqual(handle.status, 'idle');
    assert.strictEqual(handle.title, 'test');
    assert.strictEqual(handle.directory, '/tmp/test');
    assert.ok(handle.sid.startsWith('mock-session-'));
  });

  it('GIVEN created session WHEN status(sid) THEN returns current status', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    const status = await mock.status(handle.sid);
    assert.strictEqual(status, 'idle');
  });

  it('GIVEN unknown sid WHEN status THEN returns terminated', async () => {
    const mock = new OpenCodeMock();

    const status = await mock.status('nonexistent');
    assert.strictEqual(status, 'terminated');
  });

  it('GIVEN session WHEN close THEN session removed and status becomes terminated', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    await mock.close(handle.sid);
    const status = await mock.status(handle.sid);
    assert.strictEqual(status, 'terminated');
  });

  it('GIVEN session WHEN abort THEN status becomes terminated', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    await mock.abort(handle.sid);
    const status = await mock.status(handle.sid);
    assert.strictEqual(status, 'terminated');
  });
});

describe('OpenCodeMock — seed() OK responses', () => {
  it('GIVEN seed(nodeId, response) WHEN prompt with matching format THEN returns ok with output', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });
    const seededOutput = { findings: [{ severity: 'warning', file: 'src/a.ts', line: 1 }] };

    mock.seed('node_scaffold', seededOutput);

    const result = await mock.prompt(handle.sid, {
      text: 'scaffold something',
      format: makeFormat('node_scaffold'),
    });

    assertOk(result);
    assert.deepStrictEqual(result.output, seededOutput);
  });

  it('GIVEN seed on one node WHEN prompt other node THEN falls back to NO_RESULT', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seed('node_a', { kind: 'a' });

    const result = await mock.prompt(handle.sid, {
      text: 'node_b task',
      format: makeFormat('node_b'),
    });

    assertError(result, 'NO_RESULT');
  });

  it('GIVEN no seed at all WHEN prompt THEN returns NO_RESULT', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    const result = await mock.prompt(handle.sid, { text: 'do something' });

    assertError(result, 'NO_RESULT');
    assert.ok(result.error.signal?.includes('"do"'));
  });

  it('GIVEN seed over text prefix (no format) WHEN prompt THEN matches by text first word', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seed('scaffold', { kind: 'scaffold-result' });

    const result = await mock.prompt(handle.sid, { text: 'scaffold the MR' });

    assertOk(result);
    assert.strictEqual(result.output.kind, 'scaffold-result');
  });

  it('GIVEN seed with format.schema.title WHEN prompt THEN matches by title', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seed('my_custom_node', { priority: 'high' });

    const result = await mock.prompt(handle.sid, {
      text: 'some text',
      format: makeFormat('my_custom_node'),
    });

    assertOk(result);
    assert.strictEqual(result.output.priority, 'high');
  });
});

describe('OpenCodeMock — seedError() all outcome classes', () => {
  const outcomeClasses: OutcomeClass[] = [
    'NO_RESULT',
    'PARSE_ERROR',
    'SCHEMA_MISMATCH',
    'SESSION_ERROR',
    'TIMEOUT',
    'INCOMPLETE_ARTIFACT',
  ];

  for (const errorClass of outcomeClasses) {
    it(`GIVEN seedError(nodeId, '${errorClass}') WHEN prompt THEN error { class: '${errorClass}' }`, async () => {
      const mock = new OpenCodeMock();
      const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

      mock.seedError('node_x', errorClass);

      const result = await mock.prompt(handle.sid, {
        text: 'node_x process',
      });

      assertError(result, errorClass);
      assert.ok(typeof result.error.signal === 'string');
      assert.ok(result.error.signal.length > 0);
    });
  }
});

describe('OpenCodeMock — seedError produces distinct signals', () => {
  it('GIVEN PARSE_ERROR WHEN prompt THEN signal mentions JSON and includes raw', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seedError('node_p', 'PARSE_ERROR');

    const result = await mock.prompt(handle.sid, {
      text: 'node_p task',
    });

    assertError(result, 'PARSE_ERROR');
    assert.ok(result.error.signal.includes('JSON'));
    assert.ok(result.error.signal.includes('malformed'));
    assert.strictEqual(typeof result.error.details?.raw, 'string');
    assert.ok(result.error.details?.position);
  });

  it('GIVEN SCHEMA_MISMATCH WHEN prompt THEN error includes mismatchedFields details', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seedError('node_s', 'SCHEMA_MISMATCH');

    const result = await mock.prompt(handle.sid, {
      text: 'node_s validate',
    });

    assertError(result, 'SCHEMA_MISMATCH');
    assert.ok(result.error.signal.includes('schema'));
    assert.ok(Array.isArray(result.error.details?.mismatchedFields));
    assert.ok(result.error.details?.expected);
    assert.ok(result.error.details?.received);
  });

  it('GIVEN SESSION_ERROR WHEN prompt THEN error signal mentions terminated', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seedError('node_se', 'SESSION_ERROR');

    const result = await mock.prompt(handle.sid, { text: 'node_se boom' });

    assertError(result, 'SESSION_ERROR');
    assert.ok(result.error.signal.includes('terminated'));
  });

  it('GIVEN TIMEOUT WHEN prompt THEN error signal mentions timeout and duration', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seedError('node_t', 'TIMEOUT');

    const result = await mock.prompt(handle.sid, { text: 'node_t hang' });

    assertError(result, 'TIMEOUT');
    assert.ok(result.error.signal.includes('timed'));
    assert.ok(result.error.signal.includes('30s'));
  });
});

describe('OpenCodeMock — error on terminated session', () => {
  it('GIVEN closed session WHEN prompt THEN returns SESSION_ERROR', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });
    mock.seed('test', { kind: 'ok' });
    await mock.close(handle.sid);

    const result = await mock.prompt(handle.sid, { text: 'hello' });

    assertError(result, 'SESSION_ERROR');
    assert.ok(result.error.signal.includes('not found'));
  });

  it('GIVEN unknown sid WHEN prompt THEN returns SESSION_ERROR', async () => {
    const mock = new OpenCodeMock();

    const result = await mock.prompt('nonexistent', { text: 'hello' });

    assertError(result, 'SESSION_ERROR');
  });
});

describe('OpenCodeMock — continueSignal recovery', () => {
  it('GIVEN session got PARSE_ERROR WHEN continueSignal with seeded recovery THEN ok response', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'recovery', directory: '/tmp/recovery' });

    // First: force PARSE_ERROR
    mock.seedError('node_x', 'PARSE_ERROR');
    const errResult = await mock.prompt(handle.sid, { text: 'node_x task' });
    assertError(errResult, 'PARSE_ERROR');

    // Second: seed recovery data and call continueSignal
    mock.seed('node_x', { kind: 'recovered', data: 'fixed' });
    const recovered = await mock.continueSignal(handle.sid, {
      text: 'node_x retry',
    });

    assertOk(recovered);
    assert.strictEqual(recovered.output.kind, 'recovered');
    assert.strictEqual(recovered.output.data, 'fixed');
  });

  it('GIVEN continueSignal with no seeded recovery THEN returns NO_RESULT', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'recovery', directory: '/tmp/recovery' });

    mock.seedError('node_x', 'PARSE_ERROR');
    await mock.prompt(handle.sid, { text: 'node_x task' });

    // continueSignal without seeding recovery data
    const result = await mock.continueSignal(handle.sid, { text: 'node_x retry' });

    assertError(result, 'NO_RESULT');
    assert.ok(result.error.signal.includes('recovery'));
  });

  it('GIVEN continueSignal on terminated session THEN returns SESSION_ERROR', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'recovery', directory: '/tmp/recovery' });
    await mock.close(handle.sid);

    const result = await mock.continueSignal(handle.sid, { text: 'retry' });

    assertError(result, 'SESSION_ERROR');
  });
});

describe('OpenCodeMock — seedError overrides seed', () => {
  it('GIVEN seed() then seedError() for same node WHEN prompt THEN returns error (seedError takes priority)', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seed('node_x', { kind: 'ok' });
    mock.seedError('node_x', 'TIMEOUT');

    const result = await mock.prompt(handle.sid, { text: 'node_x query' });

    assertError(result, 'TIMEOUT');
  });

  it('GIVEN seedError() then seed() for same node WHEN prompt THEN returns ok (seed takes priority)', async () => {
    const mock = new OpenCodeMock();
    const handle = await mock.createSession({ title: 'test', directory: '/tmp/test' });

    mock.seedError('node_x', 'TIMEOUT');
    mock.seed('node_x', { kind: 'ok' });

    const result = await mock.prompt(handle.sid, { text: 'node_x query' });

    assertOk(result);
    assert.strictEqual(result.output.kind, 'ok');
  });
});
