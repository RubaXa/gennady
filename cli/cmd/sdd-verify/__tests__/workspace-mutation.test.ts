// @file: Runtime exact-target write-zone regressions for phase repair.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureTicketContainment,
  captureTargetContainment,
  createRepairMutationBoundary,
  ticketContainmentIssue,
  targetContainmentIssue,
} from '../workspace-mutation.ts';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'sdd-write-zone-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/target.ts'), 'target');
  writeFileSync(join(root, 'src/tracked.ts'), 'tracked');
  writeFileSync(join(root, 'src/dirty.ts'), 'tracked baseline');
  writeFileSync(join(root, 'src/delete-me.ts'), 'delete');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  writeFileSync(join(root, 'src/dirty.ts'), 'already dirty');
  writeFileSync(join(root, 'src/untracked.ts'), 'untracked');
  return root;
}

describe('createRepairMutationBoundary', () => {
  it('reports clean, pre-existing dirty, created and deleted outside-target paths', () => {
    const root = fixture();
    try {
      const boundary = createRepairMutationBoundary(root);
      const before = boundary.before(['src/target.ts']);
      writeFileSync(join(root, 'src/target.ts'), 'repaired target');
      writeFileSync(join(root, 'src/tracked.ts'), 'modified tracked');
      writeFileSync(join(root, 'src/dirty.ts'), 'dirty changed again');
      writeFileSync(join(root, 'src/untracked.ts'), 'untracked changed');
      writeFileSync(join(root, 'src/created.ts'), 'created');
      unlinkSync(join(root, 'src/delete-me.ts'));

      const result = boundary.after(before, ['src/target.ts']);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.deepStrictEqual(result.paths, [
          'src/created.ts',
          'src/delete-me.ts',
          'src/dirty.ts',
          'src/tracked.ts',
          'src/untracked.ts',
        ]);
      }
      assert.doesNotThrow(() => writeFileSync(join(root, 'src/created.ts'), 'still present'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a persistent empty directory created outside the write-set', () => {
    const root = fixture();
    try {
      const boundary = createRepairMutationBoundary(root);
      const before = boundary.before(['src/target.ts']);
      mkdirSync(join(root, 'empty-output'));
      const result = boundary.after(before, ['src/target.ts']);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.deepStrictEqual(result.paths, ['empty-output']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an in-repo symlink target before repair starts', () => {
    const root = fixture();
    try {
      symlinkSync('target.ts', join(root, 'src/alias.ts'));
      const boundary = createRepairMutationBoundary(root);
      assert.throws(() => boundary.before(['src/alias.ts']), /symlink component: src\/alias\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a regular target replaced by a symlink outside the project', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'sdd-write-zone-outside-'));
    try {
      writeFileSync(join(outside, 'outside.ts'), 'outside');
      const boundary = createRepairMutationBoundary(root);
      const before = boundary.before(['src/target.ts']);
      unlinkSync(join(root, 'src/target.ts'));
      symlinkSync(join(outside, 'outside.ts'), join(root, 'src/target.ts'));
      const result = boundary.after(before, ['src/target.ts']);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.deepStrictEqual(result.paths, ['src/target.ts']);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects a target below an in-repo symlink directory before repair starts', () => {
    const root = fixture();
    try {
      mkdirSync(join(root, 'real'));
      writeFileSync(join(root, 'real/target.ts'), 'target');
      symlinkSync(join(root, 'real'), join(root, 'src/alias'));
      const boundary = createRepairMutationBoundary(root);
      assert.throws(
        () => boundary.before(['src/alias/target.ts']),
        /symlink component: src\/alias/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('revalidates a regular target replaced by a symlink before receipt creation', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'sdd-target-containment-outside-'));
    try {
      writeFileSync(join(outside, 'outside.ts'), 'outside');
      const snapshot = captureTargetContainment(root, ['src/target.ts']);
      unlinkSync(join(root, 'src/target.ts'));
      symlinkSync(join(outside, 'outside.ts'), join(root, 'src/target.ts'));

      assert.match(
        targetContainmentIssue(snapshot) ?? '',
        /Target File path contains a symlink component: src\/target\.ts/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('detects a regular-file ticket replacement even when its canonical path is unchanged', () => {
    const root = fixture();
    try {
      const snapshot = captureTicketContainment(root, 'src/tracked.ts');
      writeFileSync(join(root, 'src/tracked.ts'), 'concurrent replacement');
      assert.match(
        ticketContainmentIssue(snapshot) ?? '',
        /ticket bytes changed outside the receipt transaction/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an allowed coverage artifact directory replaced by an escaping symlink', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'sdd-coverage-boundary-outside-'));
    try {
      const boundary = createRepairMutationBoundary(root, 'foundation');
      const before = boundary.before([], ['coverage']);
      symlinkSync(outside, join(root, 'coverage'));
      writeFileSync(join(outside, 'coverage-final.json'), '{}');

      const result = boundary.after(before, [], ['coverage']);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.deepStrictEqual(result.paths, ['coverage']);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
