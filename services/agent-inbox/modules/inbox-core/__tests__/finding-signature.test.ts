// @file: Unit tests for FindingSignature — determinism of the hash and added/resolved/unchanged classification.
// @consumers: node:test runner
// @tasks: TSK-144

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MrDetail } from '../../inbox-api/types.ts';
import {
  computeFindingSignatures,
  diffFindingSignatures,
  type FindingSignature,
} from '../finding-signature.ts';

type FindingInput = MrDetail['findings'][number];

function createFinding(overrides?: Partial<FindingInput>): FindingInput {
  return {
    severity: 'warning',
    file: 'a.ts',
    line: 1,
    message: 'unused variable',
    ...overrides,
  };
}

function createSignature(overrides?: Partial<FindingSignature>): FindingSignature {
  return {
    file: 'a.ts',
    line: 1,
    messageHash: 'H1',
    ...overrides,
  };
}

describe('computeFindingSignatures', () => {
  it('same message text produces same hash', () => {
    const [first] = computeFindingSignatures([createFinding({ message: 'unused variable x' })]);
    const [second] = computeFindingSignatures([createFinding({ message: 'unused variable x' })]);

    assert.strictEqual(first.messageHash, second.messageHash);
  });

  it('different message text produces different hash', () => {
    const [first] = computeFindingSignatures([createFinding({ message: 'unused variable x' })]);
    const [second] = computeFindingSignatures([createFinding({ message: 'unused variable y' })]);

    assert.notStrictEqual(first.messageHash, second.messageHash);
  });
});

describe('diffFindingSignatures', () => {
  it('diff reports all-added when prev is empty', () => {
    const f1 = createSignature({ file: 'a.ts', line: 1, messageHash: 'H1' });
    const f2 = createSignature({ file: 'b.ts', line: 2, messageHash: 'H2' });

    const result = diffFindingSignatures([], [f1, f2]);

    assert.deepStrictEqual(result, { added: [f1, f2], resolved: [], unchanged: [] });
  });

  it('diff reports all-resolved when current is empty', () => {
    const f1 = createSignature({ file: 'a.ts', line: 1, messageHash: 'H1' });
    const f2 = createSignature({ file: 'b.ts', line: 2, messageHash: 'H2' });

    const result = diffFindingSignatures([f1, f2], []);

    assert.deepStrictEqual(result, { added: [], resolved: [f1, f2], unchanged: [] });
  });

  it('diff treats changed message on same file:line as resolved+added, not unchanged', () => {
    // contract: identity is file:line + hash together — a changed message on the same file:line
    // is a resolved-old + added-new pair, never unchanged
    const oldSignature = createSignature({ file: 'a.ts', line: 1, messageHash: 'H1' });
    const newSignature = createSignature({ file: 'a.ts', line: 1, messageHash: 'H2' });

    const result = diffFindingSignatures([oldSignature], [newSignature]);

    assert.deepStrictEqual(result, {
      added: [newSignature],
      resolved: [oldSignature],
      unchanged: [],
    });
  });
});
