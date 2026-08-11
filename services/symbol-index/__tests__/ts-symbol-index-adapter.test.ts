// @file: Tests for TsSymbolIndexAdapter — exercises the real tree-sitter-typescript grammar (same one services/dbc/linter already depends on in this repo); each test defensively no-ops if the native module fails to load, mirroring how dbc-ts-ast-adapter.test.ts treats the same dependency.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TsSymbolIndexAdapter } from '../implementations/tree-sitter/ts-symbol-index-adapter.ts';

async function grammarLoads(): Promise<boolean> {
  try {
    await Promise.all([import('tree-sitter'), import('tree-sitter-typescript')]);
    return true;
  } catch {
    return false;
  }
}

describe('TsSymbolIndexAdapter#declaredSymbols', () => {
  it('lists exported functions, classes, and their members', async (t) => {
    if (!(await grammarLoads())) {
      t.skip('tree-sitter native module unavailable in this environment');
      return;
    }
    const adapter = new TsSymbolIndexAdapter();
    const content = [
      'export function greet(name: string): string {',
      '  return `hi ${name}`;',
      '}',
      '',
      'export class Widget {',
      '  render(): void {}',
      '}',
    ].join('\n');
    const symbols = await adapter.declaredSymbols('x.ts', content);
    const names = symbols.map((s) => s.name);
    assert.ok(names.includes('greet'));
    assert.ok(names.includes('Widget'));
    assert.ok(names.includes('render'));
  });

  it('includes non-exported top-level declarations', async (t) => {
    if (!(await grammarLoads())) {
      t.skip('tree-sitter native module unavailable in this environment');
      return;
    }
    const adapter = new TsSymbolIndexAdapter();
    const content = 'function internalHelper() {}\nconst internalConst = 1;\n';
    const names = (await adapter.declaredSymbols('x.ts', content)).map((s) => s.name);
    assert.ok(names.includes('internalHelper'));
    assert.ok(names.includes('internalConst'));
  });

  it('returns [] for unparseable content', async (t) => {
    if (!(await grammarLoads())) {
      t.skip('tree-sitter native module unavailable in this environment');
      return;
    }
    const adapter = new TsSymbolIndexAdapter();
    const symbols = await adapter.declaredSymbols('x.ts', 'export function ((( broken');
    assert.deepStrictEqual(symbols, []);
  });
});

describe('TsSymbolIndexAdapter#countReferences', () => {
  it('counts identifier occurrences exactly, precision exact', async (t) => {
    if (!(await grammarLoads())) {
      t.skip('tree-sitter native module unavailable in this environment');
      return;
    }
    const adapter = new TsSymbolIndexAdapter();
    const content = 'function widget() {}\nwidget();\nconst x = widget;\n';
    const result = await adapter.countReferences('widget', 'x.ts', content);
    assert.strictEqual(result.precision, 'exact');
    // declaration + 2 call/reference sites = 3 identifier occurrences
    assert.strictEqual(result.count, 3);
  });

  it('does not count occurrences inside string literals or comments', async (t) => {
    if (!(await grammarLoads())) {
      t.skip('tree-sitter native module unavailable in this environment');
      return;
    }
    const adapter = new TsSymbolIndexAdapter();
    const content = "// widget mentioned here\nconst s = 'widget';\nfunction other() {}\n";
    const result = await adapter.countReferences('widget', 'x.ts', content);
    assert.strictEqual(result.count, 0);
  });
});
