// @file: Unit tests for selectSymbolIndex — pure by-extension adapter selection, no tree-sitter initialization (fake adapters, never actually invoked).
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSymbolIndex } from '../select-symbol-index.ts';
import type { SymbolIndex } from '../symbol-index.types.ts';

const EXACT = { marker: 'exact' } as unknown as SymbolIndex;
const APPROX = { marker: 'approximate' } as unknown as SymbolIndex;
const adapters = { exact: EXACT, approximate: APPROX };

describe('selectSymbolIndex', () => {
  it('picks the exact adapter for .ts', () => {
    assert.strictEqual(selectSymbolIndex('cli/cmd/foo/foo.cmd.ts', adapters), EXACT);
  });

  it('picks the exact adapter for .tsx', () => {
    assert.strictEqual(selectSymbolIndex('web/App.tsx', adapters), EXACT);
  });

  it('picks the exact adapter regardless of case', () => {
    assert.strictEqual(selectSymbolIndex('weird/File.TS', adapters), EXACT);
  });

  it('picks the approximate adapter for .go', () => {
    assert.strictEqual(selectSymbolIndex('main.go', adapters), APPROX);
  });

  it('picks the approximate adapter for .py', () => {
    assert.strictEqual(selectSymbolIndex('script.py', adapters), APPROX);
  });

  it('picks the approximate adapter for .js (no grammar installed)', () => {
    assert.strictEqual(selectSymbolIndex('legacy/index.js', adapters), APPROX);
  });

  it('picks the approximate adapter for a file with no extension', () => {
    assert.strictEqual(selectSymbolIndex('Makefile', adapters), APPROX);
  });
});
