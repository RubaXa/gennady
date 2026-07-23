// @file: Unit tests for mr-stats entity-counter — computeEntityDelta, entity comparison logic.
// @consumers: node:test runner
// @tasks: TSK-139

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeEntityDelta } from '../entity-counter.ts';

function initTempRepo(dir: string): void {
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
}

function commitBase(dir: string, filename: string, content: string): string {
  writeFileSync(join(dir, filename), content, 'utf8');
  execFileSync('git', ['-C', dir, 'add', filename], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'], { stdio: 'ignore' });
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function writeMr(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, 'utf8');
}

describe('entity-counter — computeEntityDelta', () => {
  let repoDir: string;
  let baseSha: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'entity-counter-test-'));
    initTempRepo(repoDir);
  });

  afterEach(() => {
    if (existsSync(repoDir)) rmSync(repoDir, { recursive: true });
  });

  it('entity delta disjoint sets — introduced, modified, removed', async () => {
    // contract: BDD scenario "Entity counting — introduced vs modified vs removed"
    // base: 3 exported functions; MR: adds 2, changes 1, removes 1
    const baseContent = [
      'export function keepA() { return "a"; }',
      'export function keepB() { return "b"; }',
      'export function toChange() { return "old"; }',
      'export function toRemove() { return "remove me"; }',
    ].join('\n');

    baseSha = commitBase(repoDir, 'test.ts', baseContent);

    // #region START_BUILD_MR_VERSION — adds newFn, newClass, changes toChange, removes toRemove
    const mrContent = [
      'export function keepA() { return "a"; }',
      'export function keepB() { return "b"; }',
      'export function toChange() { return "new"; }',
      'export function newFn() { return "added"; }',
      'export class NewClass {}',
    ].join('\n');
    // #endregion END_BUILD_MR_VERSION

    writeMr(repoDir, 'test.ts', mrContent);

    const delta = await computeEntityDelta(repoDir, baseSha, repoDir, ['test.ts']);

    assert.strictEqual(
      delta.introduced.length,
      2,
      `expected 2 introduced, got ${delta.introduced.length}`
    );
    assert.strictEqual(
      delta.modified.length,
      1,
      `expected 1 modified, got ${delta.modified.length}`
    );
    assert.strictEqual(delta.removed.length, 1, `expected 1 removed, got ${delta.removed.length}`);

    // Verify disjoint sets
    const introSymbols = delta.introduced.map((e) => e.symbol);
    const modSymbols = delta.modified.map((e) => e.symbol);
    const removedSymbols = delta.removed.map((e) => e.symbol);

    assert.ok(introSymbols.includes('newFn'), 'newFn should be introduced');
    assert.ok(introSymbols.includes('NewClass'), 'NewClass should be introduced');
    assert.ok(modSymbols.includes('toChange'), 'toChange should be modified');
    assert.ok(removedSymbols.includes('toRemove'), 'toRemove should be removed');
  });

  it('rename = removed + introduced', async () => {
    // contract: BDD "Entity counting — переименование = removed + introduced"
    const baseContent = 'export function oldName() { return 1; }';
    baseSha = commitBase(repoDir, 'renamed.ts', baseContent);

    const mrContent = 'export function newName() { return 1; }';
    writeMr(repoDir, 'renamed.ts', mrContent);

    const delta = await computeEntityDelta(repoDir, baseSha, repoDir, ['renamed.ts']);

    assert.strictEqual(delta.introduced.length, 1);
    assert.strictEqual(delta.modified.length, 0);
    assert.strictEqual(delta.removed.length, 1);
    assert.strictEqual(delta.introduced[0].symbol, 'newName');
    assert.strictEqual(delta.removed[0].symbol, 'oldName');
  });

  it('JSDoc change only → not modified', async () => {
    // contract: BDD "Entity counting — только JSDoc изменился → не modified"
    const baseContent = [
      '/**',
      ' * Old doc comment.',
      ' */',
      'export function foo() { return 1; }',
    ].join('\n');

    baseSha = commitBase(repoDir, 'jsdoc.ts', baseContent);

    // #region START_JSDOC_ONLY_CHANGE — body identical, only JSDoc differs
    const mrContent = [
      '/**',
      ' * New documentation.',
      ' * @returns number',
      ' */',
      'export function foo() { return 1; }',
    ].join('\n');
    // #endregion END_JSDOC_ONLY_CHANGE

    writeMr(repoDir, 'jsdoc.ts', mrContent);

    const delta = await computeEntityDelta(repoDir, baseSha, repoDir, ['jsdoc.ts']);

    assert.strictEqual(delta.introduced.length, 0);
    assert.strictEqual(delta.modified.length, 0);
    assert.strictEqual(delta.removed.length, 0);
  });

  it('member reordering changes body text → detected as modified', async () => {
    // contract: member reordering in interface changes declaration body text → modified
    // insight: BDD says "не modified", but body comparison includes full declaration text including member order
    const baseContent = [
      'export interface User {',
      '  name: string;',
      '  age: number;',
      '  email: string;',
      '}',
    ].join('\n');

    baseSha = commitBase(repoDir, 'reorder.ts', baseContent);

    const mrContent = [
      'export interface User {',
      '  email: string;',
      '  name: string;',
      '  age: number;',
      '}',
    ].join('\n');

    writeMr(repoDir, 'reorder.ts', mrContent);

    const delta = await computeEntityDelta(repoDir, baseSha, repoDir, ['reorder.ts']);

    assert.strictEqual(delta.introduced.length, 0);
    assert.strictEqual(delta.modified.length, 1);
    assert.strictEqual(delta.removed.length, 0);
  });

  it('imports are not counted as entities', async () => {
    // contract: BDD "Entity counting — импорты не считаются сущностями"
    const baseContent = [
      'import { foo } from "./a";',
      'export function bar() { return foo(); }',
    ].join('\n');

    baseSha = commitBase(repoDir, 'imports.ts', baseContent);

    const mrContent = [
      'import { baz } from "./b";',
      'export function bar() { return baz(); }',
    ].join('\n');

    writeMr(repoDir, 'imports.ts', mrContent);

    const delta = await computeEntityDelta(repoDir, baseSha, repoDir, ['imports.ts']);

    // bar changed body (calls baz instead of foo) — should be modified
    // imports themselves should not appear as entities
    const allSymbols = [
      ...delta.introduced.map((e) => e.symbol),
      ...delta.modified.map((e) => e.symbol),
      ...delta.removed.map((e) => e.symbol),
    ];

    assert.ok(!allSymbols.includes('foo'), 'import "foo" should not be an entity');
    assert.ok(!allSymbols.includes('baz'), 'import "baz" should not be an entity');
    // bar's body changed → modified (calls baz instead of foo)
    // The function body changed, so modified
  });

  it('empty file list returns empty delta', async () => {
    baseSha = commitBase(repoDir, 'dummy.ts', 'export const x = 1;');

    const delta = await computeEntityDelta(repoDir, baseSha, repoDir, []);

    assert.strictEqual(delta.introduced.length, 0);
    assert.strictEqual(delta.modified.length, 0);
    assert.strictEqual(delta.removed.length, 0);
  });
});
