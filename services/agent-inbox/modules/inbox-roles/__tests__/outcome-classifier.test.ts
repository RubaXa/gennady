// @file: Unit tests for inbox-roles OutcomeClassifier — classify + remediate across all 7 outcome classes.
// @consumers: node:test runner
// @tasks: TSK-113

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { OutcomeClassifier } from '../outcome-classifier.ts';
import { composeOk, composeError } from '../../inbox-opencode/errors.ts';

let classifier: OutcomeClassifier;

before(() => {
  classifier = new OutcomeClassifier();
});

describe('OutcomeClassifier — OK', () => {
  it('classify OK → class OK + output', () => {
    const result = composeOk({ data: 'test', score: 42 });
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'OK');
    assert.ok('output' in outcome && outcome.output !== undefined);
    if ('output' in outcome) {
      assert.strictEqual(outcome.output.data, 'test');
      assert.strictEqual(outcome.output.score, 42);
    }
  });

  it('remediate OK → proceed', () => {
    const result = composeOk({ data: 'test' });
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'proceed');
  });
});

describe('OutcomeClassifier — PARSE_ERROR', () => {
  it('classify PARSE_ERROR → class PARSE_ERROR + signal', () => {
    const result = composeError('PARSE_ERROR', 'Malformed JSON at line 5');
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'PARSE_ERROR');
    assert.ok('signal' in outcome && outcome.signal.includes('Malformed JSON'));
  });

  it('remediate PARSE_ERROR → continue', () => {
    const result = composeError('PARSE_ERROR', 'Bad JSON');
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'continue');
  });
});

describe('OutcomeClassifier — SESSION_ERROR', () => {
  it('classify SESSION_ERROR → class SESSION_ERROR + signal', () => {
    const result = composeError('SESSION_ERROR', 'Session terminated');
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'SESSION_ERROR');
    assert.ok('signal' in outcome && outcome.signal.includes('Session terminated'));
  });

  it('remediate SESSION_ERROR → restart', () => {
    const result = composeError('SESSION_ERROR', 'Session died');
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'restart');
  });
});

describe('OutcomeClassifier — SCHEMA_MISMATCH', () => {
  it('classify SCHEMA_MISMATCH → class SCHEMA_MISMATCH + signal', () => {
    const result = composeError('SCHEMA_MISMATCH', 'Missing required field', {
      mismatchedFields: ['id'],
    });
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'SCHEMA_MISMATCH');
    assert.ok('signal' in outcome && outcome.signal.includes('Missing'));
  });

  it('remediate SCHEMA_MISMATCH → continue', () => {
    const result = composeError('SCHEMA_MISMATCH', 'Schema mismatch');
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'continue');
  });
});

describe('OutcomeClassifier — NO_RESULT', () => {
  it('classify NO_RESULT → class NO_RESULT + signal', () => {
    const result = composeError('NO_RESULT', 'Empty response');
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'NO_RESULT');
  });

  it('remediate NO_RESULT → continue', () => {
    const result = composeError('NO_RESULT', 'No data');
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'continue');
  });
});

describe('OutcomeClassifier — TIMEOUT', () => {
  it('classify TIMEOUT → class TIMEOUT + signal', () => {
    const result = composeError('TIMEOUT', 'Prompt timed out after 30s');
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'TIMEOUT');
  });

  it('remediate TIMEOUT → restart', () => {
    const result = composeError('TIMEOUT', 'Timed out');
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'restart');
  });
});

describe('OutcomeClassifier — INCOMPLETE_ARTIFACT', () => {
  it('classify INCOMPLETE_ARTIFACT → class INCOMPLETE_ARTIFACT + signal', () => {
    const result = composeError('INCOMPLETE_ARTIFACT', 'Missing end marker', {
      marker: '<!-- END -->',
      contentLength: 1500,
    });
    const outcome = classifier.classify(result);
    assert.strictEqual(outcome.class, 'INCOMPLETE_ARTIFACT');
  });

  it('remediate INCOMPLETE_ARTIFACT → continue', () => {
    const result = composeError('INCOMPLETE_ARTIFACT', 'Incomplete');
    const outcome = classifier.classify(result);
    const remediation = classifier.remediate(outcome);
    assert.strictEqual(remediation.action, 'continue');
  });
});
