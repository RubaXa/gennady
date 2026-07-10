// @file: Unit tests for opencode.mock factory — type validation for mockOpenCodeResponse.
// @consumers: node:test runner
// @tasks: TSK-105

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockOpenCodeResponse } from '../opencode.mock.ts';
import type { OpenCodeResponse } from '../opencode.mock.ts';

describe('mockOpenCodeResponse — default values', () => {
  it('GIVEN kind="review" and no overrides WHEN mockOpenCodeResponse THEN returns structured output with kind, findings, verdict', () => {
    const response: OpenCodeResponse = mockOpenCodeResponse('review');

    assert.strictEqual(response.kind, 'review');
    assert.strictEqual(response.verdict, 'request_changes');
    assert.strictEqual(response.findings.length, 2);
    assert.strictEqual(response.findings[0].severity, 'warning');
    assert.strictEqual(response.findings[0].file, 'src/utils.ts');
    assert.strictEqual(response.findings[0].line, 42);
    assert.strictEqual(response.findings[1].severity, 'info');
  });

  it('GIVEN kind and overrides WHEN mockOpenCodeResponse THEN overrides merged over defaults', () => {
    const response = mockOpenCodeResponse('classify', {
      findings: [
        {
          severity: 'blocking',
          file: 'src/auth.ts',
          line: 42,
          message: 'Missing input validation',
        },
      ],
      verdict: 'approved',
    });

    assert.strictEqual(response.kind, 'classify');
    assert.strictEqual(response.findings.length, 1);
    assert.strictEqual(response.findings[0].severity, 'blocking');
    assert.strictEqual(response.findings[0].file, 'src/auth.ts');
    assert.strictEqual(response.verdict, 'approved');
  });

  it('GIVEN kind with empty findings WHEN mockOpenCodeResponse THEN verdict defaults preserved', () => {
    const response = mockOpenCodeResponse('review', {
      findings: [],
    });

    assert.strictEqual(response.findings.length, 0);
    assert.strictEqual(response.verdict, 'request_changes');
  });

  it('GIVEN different kind values WHEN mockOpenCodeResponse THEN kind field correctly propagated', () => {
    const reviewResp = mockOpenCodeResponse('review');
    const classifyResp = mockOpenCodeResponse('classify');
    const summarizeResp = mockOpenCodeResponse('summarize');

    assert.strictEqual(reviewResp.kind, 'review');
    assert.strictEqual(classifyResp.kind, 'classify');
    assert.strictEqual(summarizeResp.kind, 'summarize');
  });
});
