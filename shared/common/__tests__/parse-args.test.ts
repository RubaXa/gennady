// @file: Unit tests for parseArgs — schema/alias parsing and strict unknown-flag detection.
// @consumers: parseArgs
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../parse-args.ts';

describe('parseArgs', () => {
  it('parses a known flag with a value', () => {
    const args = parseArgs(['node', 'cmd', '--spec', 'foo.spec.md'], {
      spec: { aliases: ['spec'], takesValue: true },
    });
    assert.strictEqual(args.spec, 'foo.spec.md');
  });

  it('non-strict: an unregistered flag is silently dropped (legacy behavior)', () => {
    const args = parseArgs(['node', 'cmd', '--spec', 'foo.spec.md'], {});
    assert.strictEqual(args.spec, undefined);
    // the value following the dropped flag becomes a stray positional — the exact bug being guarded against
    assert.deepStrictEqual(args._, ['foo.spec.md']);
  });

  it('strict: an unregistered flag throws instead of being dropped', () => {
    assert.throws(
      () =>
        parseArgs(
          ['node', 'cmd', '--spec', 'foo.spec.md'],
          { staged: ['staged'] },
          { strict: true }
        ),
      /Unknown flag: -spec/
    );
  });

  it('strict: every registered alias still parses with no throw', () => {
    const args = parseArgs(
      ['node', 'cmd', '--staged', '--max-words', '10'],
      {
        staged: ['staged'],
        maxWords: { aliases: ['max-words'], takesValue: true },
      },
      { strict: true }
    );
    assert.strictEqual(args.staged, true);
    assert.strictEqual(args.maxWords, '10');
  });
});
