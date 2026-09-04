// @file: Unit tests for the SDD eval judge verdict parser.
// @consumers: ai/flow-eval/judge
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict } from '../judge.ts';

describe('parseVerdict', () => {
  it('reads an explicit first-line VERDICT in either language and common decorations', () => {
    assert.equal(parseVerdict('VERDICT: pass\nAll gates green.'), 'pass');
    assert.equal(parseVerdict('VERDICT: fail\nRed required gate.'), 'fail');
    assert.equal(parseVerdict('вердикт: inconclusive\nНедостаточно данных.'), 'inconclusive');
    assert.equal(parseVerdict('**pass**\nreceipts recorded'), 'pass');
    assert.equal(parseVerdict('pass\nlooks good'), 'pass');
  });

  it('never reads a described error as a failed run when no explicit verdict is given', () => {
    // The regression: an error-handling scenario's rationale is full of "error"/"ошибка"; the old
    // substring fallback returned 'fail' for exactly this. With no explicit verdict line the honest
    // result is 'inconclusive', not a false failure.
    const errorProse =
      'The module correctly throws a typed error (ошибка домена) for every invalid input, ' +
      'and all coverage gates are green. The implementation is complete.';
    assert.equal(parseVerdict(errorProse), 'inconclusive');
  });

  it('still fails when the judge explicitly says so, even amid success words', () => {
    assert.equal(
      parseVerdict('VERDICT: fail\nThe worker passed type-check but left P2 red.'),
      'fail'
    );
  });
});
