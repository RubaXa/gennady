// @file: Unit tests for the shared npm-script gate classifier.
// @consumers: scripts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyScript, selectGates } from '../scripts.ts';

describe('classifyScript', () => {
  it('classifies typecheck by --noEmit body and canonical name', () => {
    assert.deepStrictEqual(classifyScript('type-check', 'tsc --noEmit'), ['typecheck']);
    assert.deepStrictEqual(classifyScript('typecheck', 'tsgo --noEmit'), ['typecheck']);
  });

  it('classifies gennady contract lint', () => {
    assert.ok(classifyScript('lint:contracts', 'tsx cli/gennady.ts lint --autofix cli/').includes('gennady'));
  });

  it('classifies plain eslint as lint, not when gennady present', () => {
    assert.deepStrictEqual(classifyScript('lint', 'eslint .'), ['lint']);
    assert.ok(!classifyScript('lint', 'gennady lint && eslint .').includes('lint'));
  });

  it('classifies test runners', () => {
    assert.ok(classifyScript('test', 'vitest run').includes('test'));
    assert.ok(classifyScript('test', 'node --import tsx --test').includes('test'));
  });

  it('classifies format', () => {
    assert.ok(classifyScript('format:check', 'prettier --check .').includes('format'));
  });

  it('treats composite gates as umbrella', () => {
    assert.deepStrictEqual(classifyScript('check', 'npm run type-check && npm run test'), ['umbrella']);
    assert.deepStrictEqual(classifyScript('lint', 'tsc --noEmit && eslint .'), ['umbrella']);
  });

  it('returns unknown when nothing matches', () => {
    assert.deepStrictEqual(classifyScript('clean', 'rm -rf dist'), ['unknown']);
  });

  it('excludes build:/prepublish typecheck and lint:fix', () => {
    assert.ok(!classifyScript('build:types', 'tsc -p tsconfig.json').includes('typecheck'));
    assert.ok(!classifyScript('lint:fix', 'eslint . --fix').includes('lint'));
  });
});

describe('selectGates', () => {
  it('selects one best script per declared class', () => {
    const gates = selectGates({
      'type-check': 'tsc --noEmit',
      test: 'node --import tsx --test',
      'format:check': 'prettier --check .',
      'lint:contracts': 'tsx cli/gennady.ts lint cli/',
      clean: 'rm -rf dist',
    });
    assert.strictEqual(gates.typecheck, 'type-check');
    assert.strictEqual(gates.test, 'test');
    assert.strictEqual(gates.format, 'format:check');
    assert.strictEqual(gates.gennady, 'lint:contracts');
    assert.strictEqual(gates.lint, undefined);
  });

  it('prefers higher-priority name within a class', () => {
    const gates = selectGates({ 'lint:all': 'eslint .', lint: 'eslint src/' });
    assert.strictEqual(gates.lint, 'lint');
  });

  it('returns empty gates for a project with no recognizable scripts', () => {
    assert.deepStrictEqual(selectGates({ clean: 'rm -rf dist', dev: 'vite' }), {});
  });
});
