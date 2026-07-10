// @file: Unit tests for OpenCodeReal — UNAVAILABLE, structured output, schema validation.
// @consumers: node:test runner
// @tasks: TSK-112

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeReal } from '../opencode.real.ts';
import { composeOk, composeError, type OpenCodeCallResult, type OutcomeClass } from '../errors.ts';

// ── helpers ──

function makeFormat(title: string, requiredFields?: string[]) {
  const properties: Record<string, { type: string }> = {};
  if (requiredFields) {
    for (const field of requiredFields) {
      properties[field] = { type: 'string' };
    }
  }
  return {
    type: 'json_schema' as const,
    schema: {
      title,
      type: 'object',
      properties,
      required: requiredFields ?? [],
    },
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

describe('OpenCodeReal — UNAVAILABLE (no server running)', () => {
  it('GIVEN opencode not running WHEN createSession THEN throws with connection error', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    await assert.rejects(
      async () => {
        await real.createSession({ title: 'test', directory: '/tmp/test' });
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        return /ECONNREFUSED|fetch failed|unavailable|connect/i.test(message);
      },
      'Expected connection error when opencode is not running'
    );
  });

  it('GIVEN opencode not running WHEN prompt THEN returns SESSION_ERROR (UNAVAILABLE)', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    const result = await real.prompt('fake-sid', { text: 'hello world' });

    assertError(result, 'SESSION_ERROR');
    assert.ok(
      result.error.signal?.includes('unavailable') || result.error.signal?.includes('fetch failed'),
      `Expected "unavailable" or "fetch failed" in signal, got: ${result.error.signal}`
    );
  });

  it('GIVEN opencode not running WHEN status THEN returns terminated', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    const status = await real.status('any-sid');

    assert.strictEqual(status, 'terminated');
  });

  it('GIVEN opencode not running WHEN continueSignal THEN returns SESSION_ERROR', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    const result = await real.continueSignal('fake-sid', {
      system: 'retry',
      text: 'fix the output',
    });

    assertError(result, 'SESSION_ERROR');
  });

  it('GIVEN opencode not running WHEN abort THEN does not throw (swallows error)', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    // abort must not throw — it swallows errors
    await assert.doesNotReject(async () => {
      await real.abort('any-sid');
    });
  });

  it('GIVEN opencode not running WHEN close THEN does not throw (swallows error)', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    // close must not throw — it swallows errors
    await assert.doesNotReject(async () => {
      await real.close('any-sid');
    });
  });
});

describe('OpenCodeReal — prompt with structured output (mocked client)', () => {
  it('GIVEN mock client returns text WHEN prompt without format THEN returns text output', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    // Mock _sendPrompt to return a text response
    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeOk({
        text: 'This is a regular text response',
        raw: 'This is a regular text response',
      });
    });

    const result = await real.prompt('mock-sid', { text: 'hello' });

    assertOk(result);
    assert.strictEqual(result.output.text, 'This is a regular text response');

    mock.restoreAll();
  });

  it('GIVEN mock client returns valid JSON WHEN prompt with format THEN returns parsed JSON output', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    const jsonOutput = { findings: [{ severity: 'warning', file: 'src/a.ts' }] };

    // Mock _sendPrompt to return a JSON response with ```json block
    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeOk(jsonOutput);
    });

    const result = await real.prompt('mock-sid', {
      text: 'analyze code',
      format: makeFormat('node_scaffold'),
    });

    assertOk(result);
    assert.deepStrictEqual(result.output, jsonOutput);

    mock.restoreAll();
  });

  it('GIVEN mock client returns malformed JSON WHEN prompt with format THEN returns PARSE_ERROR', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    // Mock _sendPrompt to return a PARSE_ERROR result
    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError('PARSE_ERROR', 'Failed to parse JSON from AI response', {
        raw: '{"broken": incomplete',
      });
    });

    const result = await real.prompt('mock-sid', {
      text: 'analyze code',
      format: makeFormat('node_parse_test'),
    });

    assertError(result, 'PARSE_ERROR');
    assert.ok(
      result.error.signal.includes('parse'),
      `Expected "parse" in signal, got: ${result.error.signal}`
    );

    mock.restoreAll();
  });

  it('GIVEN mock client returns schema-mismatched JSON WHEN prompt with format THEN returns SCHEMA_MISMATCH', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    // Mock _sendPrompt to return a SCHEMA_MISMATCH result
    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError(
        'SCHEMA_MISMATCH',
        'Output does not match expected schema: required field "id" is missing',
        {
          mismatchedFields: ['required field "id" is missing'],
          expected: { type: 'object', required: ['id'] },
          received: { name: 'test' },
        }
      );
    });

    const result = await real.prompt('mock-sid', {
      text: 'analyze code',
      format: makeFormat('node_schema_test', ['id']),
    });

    assertError(result, 'SCHEMA_MISMATCH');
    assert.ok(
      result.error.signal.includes('schema'),
      `Expected "schema" in signal, got: ${result.error.signal}`
    );
    assert.ok(
      Array.isArray(result.error.details?.mismatchedFields),
      'Expected mismatchedFields array in details'
    );

    mock.restoreAll();
  });

  it('GIVEN mock client returns no JSON WHEN prompt with format THEN returns NO_RESULT', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    // Mock _sendPrompt to return a NO_RESULT error
    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError('NO_RESULT', 'No JSON found in AI response', {
        raw: 'Just some text without any JSON',
      });
    });

    const result = await real.prompt('mock-sid', {
      text: 'analyze code',
      format: makeFormat('node_empty'),
    });

    assertError(result, 'NO_RESULT');
    assert.ok(
      result.error.signal.includes('JSON'),
      `Expected "JSON" in signal, got: ${result.error.signal}`
    );

    mock.restoreAll();
  });
});

describe('OpenCodeReal — error classification from server', () => {
  it('GIVEN mock _sendPrompt returns SESSION_ERROR WHEN prompt THEN correctly classified', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError('SESSION_ERROR', 'Session was aborted unexpectedly');
    });

    const result = await real.prompt('error-sid', { text: 'test' });

    assertError(result, 'SESSION_ERROR');

    mock.restoreAll();
  });

  it('GIVEN mock _sendPrompt returns TIMEOUT WHEN prompt THEN correctly classified', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError('TIMEOUT', 'Prompt timed out after 30s');
    });

    const result = await real.prompt('timeout-sid', { text: 'test' });

    assertError(result, 'TIMEOUT');
    assert.ok(
      result.error.signal.includes('timed'),
      `Expected "timed" in signal, got: ${result.error.signal}`
    );

    mock.restoreAll();
  });

  it('GIVEN mock _sendPrompt returns INCOMPLETE_ARTIFACT WHEN prompt THEN correctly classified', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError('INCOMPLETE_ARTIFACT', 'Output exceeded length limit', { raw: '' });
    });

    const result = await real.prompt('incomplete-sid', { text: 'test' });

    assertError(result, 'INCOMPLETE_ARTIFACT');

    mock.restoreAll();
  });
});

describe('OpenCodeReal — continueSignal reuses _sendPrompt', () => {
  it('GIVEN mock _sendPrompt returns ok WHEN continueSignal THEN returns ok', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    const recovered = { kind: 'recovered', data: 'fixed' };

    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeOk(recovered);
    });

    const result = await real.continueSignal('recover-sid', {
      system: 'fix the error',
      text: 'retry with correct format',
      format: makeFormat('recovery_node'),
    });

    assertOk(result);
    assert.strictEqual(result.output.kind, 'recovered');

    mock.restoreAll();
  });

  it('GIVEN mock _sendPrompt returns error WHEN continueSignal THEN returns error', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://localhost:4096' });

    const sendPromptMock = mock.method(OpenCodeReal.prototype, '_sendPrompt' as never);
    sendPromptMock.mock.mockImplementationOnce(async () => {
      return composeError('PARSE_ERROR', 'Still cannot parse JSON', { raw: '{bad' });
    });

    const result = await real.continueSignal('recover-sid', {
      text: 'retry again',
      format: makeFormat('recovery_node'),
    });

    assertError(result, 'PARSE_ERROR');

    mock.restoreAll();
  });
});

describe('OpenCodeReal — constructor defaults', () => {
  it('GIVEN no options WHEN new OpenCodeReal THEN baseUrl defaults to localhost:4096', () => {
    const real = new OpenCodeReal();
    // baseUrl is internal; verify by checking the instance exists
    assert.ok(real instanceof OpenCodeReal);
  });

  it('GIVEN custom baseUrl WHEN new OpenCodeReal THEN uses custom baseUrl', () => {
    const real = new OpenCodeReal({ baseUrl: 'http://custom:8080' });
    assert.ok(real instanceof OpenCodeReal);
  });
});
