// @file: Unit tests for GrepSymbolIndexAdapter — pure regex over text, no native module, runs unconditionally.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GrepSymbolIndexAdapter } from '../implementations/grep/grep-symbol-index-adapter.ts';

describe('GrepSymbolIndexAdapter#declaredSymbols', () => {
  it('finds a Python def', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const symbols = await adapter.declaredSymbols('script.py', 'def handle_request(req):\n    pass\n');
    assert.ok(symbols.some((s) => s.name === 'handle_request'));
    assert.strictEqual(symbols[0]?.kind, 'approximate-declaration');
  });

  it('finds a Go func', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const symbols = await adapter.declaredSymbols('main.go', 'func Serve(addr string) error {\n}\n');
    assert.ok(symbols.some((s) => s.name === 'Serve'));
  });

  it('finds class/interface/struct/type/const declarations', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const content = [
      'class Widget {}',
      'interface Shape {}',
      'struct Point {}',
      'type Id = string;',
      'const answer = 42;',
    ].join('\n');
    const names = (await adapter.declaredSymbols('x.ext', content)).map((s) => s.name);
    assert.deepStrictEqual(new Set(names), new Set(['Widget', 'Shape', 'Point', 'Id', 'answer']));
  });

  it('deduplicates repeated declarations of the same name', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const symbols = await adapter.declaredSymbols(
      'x.ext',
      'function run() {}\nfunction run() {}\n'
    );
    assert.strictEqual(symbols.filter((s) => s.name === 'run').length, 1);
  });

  it('reports the 1-based line of the first match', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const symbols = await adapter.declaredSymbols('x.ext', '\n\nfunction third() {}\n');
    assert.strictEqual(symbols.find((s) => s.name === 'third')?.line, 3);
  });
});

describe('GrepSymbolIndexAdapter#countReferences', () => {
  it('counts word-boundary matches, precision approximate', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const result = await adapter.countReferences('foo', 'x.ext', 'foo(); bar(foo); fooBar();');
    // fooBar does NOT match `\bfoo\b` (no boundary between 'foo' and 'B'... actually 'o'->'B' IS a
    // boundary since \w->\w has no boundary; 'o' and 'B' are both word chars, so no boundary — not counted)
    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.precision, 'approximate');
  });

  it('returns 0 for a name that does not appear', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const result = await adapter.countReferences('missing', 'x.ext', 'nothing here');
    assert.strictEqual(result.count, 0);
  });

  it('escapes regex metacharacters in the name', async () => {
    const adapter = new GrepSymbolIndexAdapter();
    const result = await adapter.countReferences('a.b', 'x.ext', 'a.b is not aXb');
    assert.strictEqual(result.count, 1);
  });
});
