// @file: Unit tests for the <ACR>-REQ-<N> / <ACR>-DL-<N> grammar and spec-acronym derivation.
// @consumers: requirement-id
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQ_ID_GRAMMAR,
  DL_ID_GRAMMAR,
  LEGACY_DL_ID_GRAMMAR,
  deriveSpecAcronym,
  validateSpecEntryId,
  specEntryAcronym,
  specEntryNumber,
  describeAcronymMismatch,
  describeNumberCollision,
} from '../requirement-id.ts';

describe('deriveSpecAcronym', () => {
  it('derives initials from a multi-word file name', () => {
    assert.strictEqual(deriveSpecAcronym('specs/agent-inbox/inbox-core/inbox-core.spec.md'), 'IC');
    assert.strictEqual(deriveSpecAcronym('mr-stats.spec.md'), 'MS');
    assert.strictEqual(deriveSpecAcronym('agent-mon-cli.spec.md'), 'AMC');
  });

  it('takes the first 3 chars of a single-word file name', () => {
    assert.strictEqual(deriveSpecAcronym('specs/vcs/vcs.spec.md'), 'VCS');
    assert.strictEqual(deriveSpecAcronym('dbc.spec.md'), 'DBC');
  });

  it('uses whatever it has for a short single word', () => {
    assert.strictEqual(deriveSpecAcronym('ui.spec.md'), 'UI');
  });

  it('handles the .1-spec.md legacy filename suffix', () => {
    assert.strictEqual(deriveSpecAcronym('specs/cli/cli.1-spec.md'), 'CLI');
  });

  it('works with backslash path separators', () => {
    assert.strictEqual(
      deriveSpecAcronym('specs\\agent-inbox\\inbox-core\\inbox-core.spec.md'),
      'IC'
    );
  });
});

describe('REQ_ID_GRAMMAR / DL_ID_GRAMMAR / LEGACY_DL_ID_GRAMMAR', () => {
  it('accepts well-formed IDs', () => {
    assert.match('GAT-REQ-1', REQ_ID_GRAMMAR);
    assert.match('GAT-DL-1', DL_ID_GRAMMAR);
    assert.match('D-301', LEGACY_DL_ID_GRAMMAR);
  });

  it('rejects a lowercase acronym', () => {
    assert.doesNotMatch('gat-REQ-1', REQ_ID_GRAMMAR);
    assert.doesNotMatch('gat-DL-1', DL_ID_GRAMMAR);
  });

  it('rejects a missing number', () => {
    assert.doesNotMatch('GAT-REQ-', REQ_ID_GRAMMAR);
    assert.doesNotMatch('GAT-DL-', DL_ID_GRAMMAR);
  });

  it('REQ and DL grammars are mutually exclusive', () => {
    assert.doesNotMatch('GAT-DL-1', REQ_ID_GRAMMAR);
    assert.doesNotMatch('GAT-REQ-1', DL_ID_GRAMMAR);
  });
});

describe('validateSpecEntryId', () => {
  it('accepts a well-formed REQ id (grammar only, no acronym check here)', () => {
    assert.strictEqual(validateSpecEntryId('GAT-REQ-3', 'REQ', 'GAT'), null);
  });

  it('rejects and explains a malformed REQ id', () => {
    const reason = validateSpecEntryId('gat-req-3', 'REQ', 'GAT');
    assert.match(reason ?? '', /<ACR>-REQ-<N>/);
    assert.match(reason ?? '', /GAT-REQ-1/);
  });

  it('rejects and explains a malformed DL id', () => {
    const reason = validateSpecEntryId('acr-dl-3', 'DL', 'ACR');
    assert.match(reason ?? '', /<ACR>-DL-<N>/);
    assert.match(reason ?? '', /ACR-DL-1/);
  });
});

describe('specEntryAcronym / specEntryNumber', () => {
  it('extracts both halves of a grammar-valid id', () => {
    assert.strictEqual(specEntryAcronym('GAT-REQ-7', 'REQ'), 'GAT');
    assert.strictEqual(specEntryNumber('GAT-REQ-7', 'REQ'), '7');
    assert.strictEqual(specEntryAcronym('GAT-DL-2', 'DL'), 'GAT');
    assert.strictEqual(specEntryNumber('GAT-DL-2', 'DL'), '2');
  });

  it('returns null for a grammar-invalid id', () => {
    assert.strictEqual(specEntryAcronym('gat-req-7', 'REQ'), null);
    assert.strictEqual(specEntryNumber('gat-req-7', 'REQ'), null);
  });
});

describe('describeAcronymMismatch / describeNumberCollision', () => {
  it('names both the actual and expected acronym', () => {
    const msg = describeAcronymMismatch('FOO-REQ-1', 'REQ', 'FOO', 'GAT', '1');
    assert.match(msg, /FOO/);
    assert.match(msg, /GAT/);
    assert.match(msg, /GAT-REQ-1/);
  });

  it('lists every colliding id', () => {
    const msg = describeNumberCollision('DL', '3', ['GAT-DL-3', 'GAT-DL-3']);
    assert.match(msg, /GAT-DL-3/);
    assert.match(msg, /2/);
  });
});
