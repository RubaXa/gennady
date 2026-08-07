// @file: Tests for GateVerdict — review.json completeness validation per §2.1 criteria with escalation on 2 failed attempts
// @consumers: node:test runner
// @tasks: TSK-161

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GateVerdict } from '../gate-verdict.ts';
import type { ReviewJson, ReviewFinding } from '../gate-verdict.ts';

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'F-001',
    severity: 'error',
    file: 'src/index.ts',
    line: 42,
    summary: 'null check missing',
    ...overrides,
  };
}

function validReview(overrides: Partial<ReviewJson> = {}): ReviewJson {
  return {
    verdict: 'APPROVE',
    revision: 1,
    findings: [finding()],
    ...overrides,
  };
}

describe('GateVerdict', () => {
  let gate: GateVerdict;

  beforeEach(() => {
    gate = new GateVerdict();
  });

  it('verdict missing returns fail with verdict required reason', () => {
    const review = validReview();
    delete review.verdict;

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'fail');
    assert.match(result.reasons.join(', '), /S2_1_VERDICT_PRESENT/);
  });

  it('finding without file:line returns fail with file line required reason', () => {
    const review = validReview({
      findings: [
        finding({ file: undefined, line: undefined }),
      ],
    });

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'fail');
    assert.match(result.reasons.join(', '), /S2_1_FINDINGS_HAVE_FILE_LINE/);
  });

  it('empty findings array returns pass with no issues', () => {
    const review = validReview({ findings: [] });

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'pass');
    assert.deepStrictEqual(result.reasons, []);
  });

  it('finding with empty summary returns fail with summary required reason', () => {
    const review = validReview({
      findings: [finding({ summary: '' })],
    });

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'fail');
    assert.match(result.reasons.join(', '), /S2_1_FINDINGS_HAVE_FILE_LINE/);
  });

  it('revision not specified returns fail', () => {
    const review = validReview();
    delete review.revision;

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'fail');
    assert.match(result.reasons.join(', '), /S2_1_REVISION_PRESENT/);
  });

  it('verdict not in valid set returns fail', () => {
    const review = validReview({ verdict: 'UNKNOWN' as ReviewJson['verdict'] });

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'fail');
  });

  it('isEscalated returns true after 2 validation attempts', () => {
    const review = validReview();
    delete review.verdict;

    gate.validate(review);
    assert.strictEqual(gate.isEscalated(), false);

    gate.validate(review);
    assert.strictEqual(gate.isEscalated(), true);
  });

  it('complete review.json returns pass with revision verdict findings and summary', () => {
    const review: ReviewJson = {
      verdict: 'REQUEST_CHANGES',
      revision: 2,
      findings: [
        finding({ id: 'F-001', file: 'src/a.ts', line: 10, summary: 'use const' }),
        finding({ id: 'F-002', file: 'src/b.ts', line: 20, summary: 'missing null guard' }),
      ],
    };

    const result = gate.validate(review);

    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.reasons.length, 0);
  });
});
