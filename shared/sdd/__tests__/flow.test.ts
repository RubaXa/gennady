// @file: Unit tests for detectFlowVersion / detectScopeFlowVersion (v1/v2 layout markers).
// @consumers: flow
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFlowVersion, detectScopeFlowVersion } from '../flow.ts';

describe('detectFlowVersion', () => {
  let root: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'sdd-flow-'));
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a repo with a tasks/ directory → v1', () => {
    const v1 = mkdtempSync(join(tmpdir(), 'sdd-v1-'));
    mkdirSync(join(v1, 'tasks'));
    assert.strictEqual(detectFlowVersion(v1), 'v1');
    rmSync(v1, { recursive: true, force: true });
  });

  it('a repo without tasks/ → v2', () => {
    assert.strictEqual(detectFlowVersion(root), 'v2');
  });

  it('a nonexistent root → v2 (no v1 marker)', () => {
    assert.strictEqual(detectFlowVersion(join(root, 'does-not-exist')), 'v2');
  });
});

describe('detectScopeFlowVersion', () => {
  it('смешанный репо: v1-scope → v1; мигрированный (нет tasks/ + есть 3-tasks индекс) → v2; scope без задач вообще → v1', () => {
    const mixed = mkdtempSync(join(tmpdir(), 'sdd-mixed-'));
    mkdirSync(join(mixed, 'tasks', 'old-scope'), { recursive: true });
    mkdirSync(join(mixed, 'specs', 'old-scope'), { recursive: true });
    mkdirSync(join(mixed, 'specs', 'migrated'), { recursive: true });
    mkdirSync(join(mixed, 'specs', 'taskless'), { recursive: true });
    writeFileSync(
      join(mixed, 'specs', 'migrated', 'migrated.3-tasks.md'),
      '# Tasks: migrated\n',
      'utf-8'
    );
    assert.strictEqual(detectScopeFlowVersion(mixed, 'old-scope'), 'v1');
    assert.strictEqual(detectScopeFlowVersion(mixed, 'migrated'), 'v2');
    assert.strictEqual(detectScopeFlowVersion(mixed, 'taskless'), 'v1');
    rmSync(mixed, { recursive: true, force: true });
  });

  it('на глобально-v2 репо каждый scope v2 (индекс не требуется)', () => {
    const v2 = mkdtempSync(join(tmpdir(), 'sdd-v2repo-'));
    mkdirSync(join(v2, 'specs', 'any'), { recursive: true });
    assert.strictEqual(detectScopeFlowVersion(v2, 'any'), 'v2');
    rmSync(v2, { recursive: true, force: true });
  });
});
