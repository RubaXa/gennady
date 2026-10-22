// @file: Unit tests for detectFlowVersion / detectScopeFlowVersion (v1/v2 layout markers).
// @spec: SHARED
// @consumers: flow

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFlowVersion, detectScopeFlowVersion, ticketFlowVersion } from '../flow.ts';

const LEGACY_TICKET = '# Task: historical\n\n## 1. Meta\n- Task-ID: TSK-1\n\n## 6. Execution Log\n';

describe('detectFlowVersion', () => {
  let root: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'sdd-flow-'));
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('an empty tasks directory is not evidence of V1', () => {
    const v1 = mkdtempSync(join(tmpdir(), 'sdd-v1-'));
    mkdirSync(join(v1, 'tasks'));
    assert.strictEqual(detectFlowVersion(v1), 'v2');
    rmSync(v1, { recursive: true, force: true });
  });

  it('a repo without tasks/ → v2', () => {
    assert.strictEqual(detectFlowVersion(root), 'v2');
  });

  it('a nonexistent root → v2 (no v1 marker)', () => {
    assert.strictEqual(detectFlowVersion(join(root, 'does-not-exist')), 'v2');
  });

  for (const [path, content, expected] of [
    ['README.md', '# Build tasks\nOrdinary task documentation.\n', 'v2'],
    ['README.md', '# Build examples\n- **Task-ID:** example-token\n', 'v2'],
    ['grunt/build.js', 'export default function build() {}\n', 'v2'],
    ['scope/a/b/c/d/unusual.IB-12.md', LEGACY_TICKET, 'v1'],
    ['scope/custom.md', '<!--SECTION:META-->\n- Task-ID: TSK-12\n<!--/SECTION:META-->\n', 'v1'],
    ['scope/custom.md', '<!--SECTION:META--><!--SECTION:EXECUTION_LOG-->', 'v1'],
    ['scope/broken.task-123.md', 'incomplete historical ticket', 'v1'],
  ] as const) {
    it(`classifies ${path} from its actual SDD signals as ${expected}`, () => {
      const project = mkdtempSync(join(tmpdir(), 'sdd-flow-signals-'));
      try {
        mkdirSync(join(project, 'tasks', path, '..'), { recursive: true });
        writeFileSync(join(project, 'tasks', path), content);
        assert.equal(detectFlowVersion(project), expected);
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    });
  }

  it('keeps unsafe tasks aliases migration-blocked instead of traversing them', () => {
    const project = mkdtempSync(join(tmpdir(), 'sdd-flow-alias-'));
    const outside = mkdtempSync(join(tmpdir(), 'sdd-flow-external-'));
    try {
      mkdirSync(join(project, 'tasks'));
      writeFileSync(join(outside, 'README.md'), '# ordinary documentation\n');
      symlinkSync(join(outside, 'README.md'), join(project, 'tasks', 'alias.md'));
      assert.equal(detectFlowVersion(project), 'v1');
      rmSync(join(project, 'tasks'), { recursive: true, force: true });
      symlinkSync(outside, join(project, 'tasks'));
      assert.equal(detectFlowVersion(project), 'v1');
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it(
    'keeps unreadable tasks inventory migration-blocked',
    { skip: process.getuid?.() === 0 },
    () => {
      const project = mkdtempSync(join(tmpdir(), 'sdd-flow-unreadable-'));
      const tasks = join(project, 'tasks');
      mkdirSync(tasks);
      chmodSync(tasks, 0);
      try {
        assert.equal(detectFlowVersion(project), 'v1');
      } finally {
        chmodSync(tasks, 0o700);
        rmSync(project, { recursive: true, force: true });
      }
    }
  );
});

describe('detectScopeFlowVersion', () => {
  it('смешанный репо: v1-scope → v1; мигрированный (нет tasks/ + есть 3-tasks индекс) → v2; scope без задач вообще → v1', () => {
    const mixed = mkdtempSync(join(tmpdir(), 'sdd-mixed-'));
    mkdirSync(join(mixed, 'tasks', 'old-scope'), { recursive: true });
    writeFileSync(join(mixed, 'tasks', 'old-scope', 'work.md'), LEGACY_TICKET);
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

describe('ticketFlowVersion', () => {
  it('uses the same per-scope boundary for legacy tasks and migrated co-located tickets', () => {
    const mixed = mkdtempSync(join(tmpdir(), 'sdd-ticket-flow-'));
    mkdirSync(join(mixed, 'tasks', 'old-scope'), { recursive: true });
    writeFileSync(join(mixed, 'tasks', 'old-scope', 'work.md'), LEGACY_TICKET);
    mkdirSync(join(mixed, 'specs', 'old-scope'), { recursive: true });
    mkdirSync(join(mixed, 'specs', 'migrated'), { recursive: true });
    writeFileSync(
      join(mixed, 'specs', 'migrated', 'migrated.3-tasks.md'),
      '# Tasks: migrated\n',
      'utf-8'
    );
    assert.strictEqual(
      ticketFlowVersion(join(mixed, 'tasks', 'old-scope', 'old.task.md'), mixed),
      'v1'
    );
    assert.strictEqual(
      ticketFlowVersion(join(mixed, 'specs', 'migrated', 'migrated.task.M-new.md'), mixed),
      'v2'
    );
    rmSync(mixed, { recursive: true, force: true });
  });
});
