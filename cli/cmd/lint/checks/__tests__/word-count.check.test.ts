// @file: Unit coverage for semantic header and JSDoc contract word budgets.
// @consumers: WordCountCheck
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check, DEFAULT_CONTRACT_WORDS, DEFAULT_HEADER_WORDS } from '../word-count.check.ts';

describe('WordCountCheck semantic budgets', () => {
  it('enforces independent header and contract boundaries', () => {
    const content = [
      '// @file: one two three four',
      '// @consumers: Client',
      '/** @purpose one two three four five */',
    ].join('\n');
    assert.deepStrictEqual(check(content, 'demo.ts', { header: 4, contract: 5 }), []);
    assert.deepStrictEqual(
      check(content, 'demo.ts', { header: 3, contract: 4 }).map((error) => error.message),
      [
        '[WordCountCheck#check] header @file has 4 semantic prose words (limit 3) — rewrite the whole contract coherently; do not truncate one word.',
        '[WordCountCheck#check] contract @purpose has 5 semantic prose words (limit 4) — rewrite the whole contract coherently; do not truncate one word.',
      ]
    );
  });

  it('keeps multiline prose with its tag until the next tag', () => {
    const content = [
      '/**',
      ' * @purpose first second',
      ' * third fourth',
      ' * @returns result prose',
      ' */',
    ].join('\n');
    const findings = check(content, 'demo.ts', { header: 99, contract: 3 });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.line, 2);
    assert.match(findings[0]?.message ?? '', /contract @purpose has 4 semantic prose words/);
  });

  it('does not count param names, type syntax, URLs, paths, or exact identifiers as prose', () => {
    const content = [
      '/**',
      ' * @param {ReadonlyArray<FooService>} serviceNames - resolves useful values',
      ' * @see https://example.test/path specs/cli/lint/lint.spec.md `FooService` AX_WORD_BUDGET',
      ' */',
    ].join('\n');
    const contractFindings = check(content, 'demo.ts', { header: 99, contract: 2 });
    assert.strictEqual(contractFindings.length, 1);
    assert.match(contractFindings[0]?.message ?? '', /contract @param has 3 semantic prose words/);
    const headerFindings = check('// @file: plain coherent narrative words', 'demo.ts', {
      header: 3,
      contract: 99,
    });
    assert.strictEqual(headerFindings.length, 1);
    assert.match(headerFindings[0]?.message ?? '', /header @file has 4 semantic prose words/);
  });

  it('keeps the numeric legacy direct-call override for both categories', () => {
    const content = '// @file: one two three\n/** @purpose one two three */';
    assert.strictEqual(check(content, 'demo.ts', 2).length, 2);
    assert.strictEqual(check(content, 'demo.ts', 3).length, 0);
  });

  it('pins both typed defaults at their boundary and catches narrative growth', () => {
    const words = (count: number): string =>
      Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
    const limits = { header: DEFAULT_HEADER_WORDS, contract: DEFAULT_CONTRACT_WORDS };
    const atLimit = `// @file: ${words(DEFAULT_HEADER_WORDS)}\n/** @purpose ${words(DEFAULT_CONTRACT_WORDS)} */`;
    assert.deepStrictEqual(check(atLimit, 'demo.ts', limits), []);
    const overLimit = `// @file: ${words(DEFAULT_HEADER_WORDS + 1)}\n/** @purpose ${words(DEFAULT_CONTRACT_WORDS + 1)} */`;
    assert.strictEqual(check(overLimit, 'demo.ts', limits).length, 2);
  });
});
