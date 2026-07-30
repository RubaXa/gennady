// @file: Unit tests for linkWorktreeDependencies on a real temp filesystem (clone/worktree pair).
// @consumers: node:test runner
// @tasks: TSK-168

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linkWorktreeDependencies, type WorktreeLinkFsDeps } from './worktree-links.logic.ts';

type LinksContext = {
  root: string;
  clonePath: string;
  worktreePath: string;
  fsDeps: WorktreeLinkFsDeps;
};

/**
 * @purpose Build a real tmpdir clone/worktree pair plus real `node:fs` functions as
 *   `WorktreeLinkFsDeps` — the contract under test is real symlink creation.
 */
function createLinksContext(): LinksContext {
  const root = mkdtempSync(join(tmpdir(), 'worktree-links-'));
  const clonePath = join(root, 'clone');
  const worktreePath = join(root, 'worktree');
  mkdirSync(clonePath, { recursive: true });
  mkdirSync(worktreePath, { recursive: true });
  return {
    root,
    clonePath,
    worktreePath,
    fsDeps: { existsSync, readdirSync, readFileSync, symlinkSync },
  };
}

describe('linkWorktreeDependencies', () => {
  let ctx: LinksContext;

  beforeEach(() => {
    ctx = createLinksContext();
  });

  afterEach(() => {
    rmSync(ctx.root, { recursive: true, force: true });
  });

  it('symlinks existing candidate', () => {
    mkdirSync(join(ctx.clonePath, 'node_modules'));
    writeFileSync(join(ctx.clonePath, 'node_modules', 'marker.txt'), 'from-clone');

    linkWorktreeDependencies(ctx.clonePath, ctx.worktreePath, ctx.fsDeps);

    const linkPath = join(ctx.worktreePath, 'node_modules');
    assert.strictEqual(readlinkSync(linkPath), join(ctx.clonePath, 'node_modules'));
    assert.strictEqual(readFileSync(join(linkPath, 'marker.txt'), 'utf8'), 'from-clone');
  });

  it('skips missing candidate silently', () => {
    linkWorktreeDependencies(ctx.clonePath, ctx.worktreePath, ctx.fsDeps);

    assert.strictEqual(existsSync(join(ctx.worktreePath, 'vendor')), false);
  });

  it('never links .env even when present', () => {
    writeFileSync(join(ctx.clonePath, '.env'), 'SECRET=leaked-if-linked');

    linkWorktreeDependencies(ctx.clonePath, ctx.worktreePath, ctx.fsDeps);

    assert.strictEqual(existsSync(join(ctx.worktreePath, '.env')), false);
  });

  it('symlinks workspace packages', () => {
    // setup: worktree mirrors a git checkout — package dirs exist, node_modules does not
    writeFileSync(join(ctx.clonePath, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    for (const pkg of ['a', 'b']) {
      mkdirSync(join(ctx.clonePath, 'packages', pkg, 'node_modules'), { recursive: true });
      mkdirSync(join(ctx.worktreePath, 'packages', pkg), { recursive: true });
    }

    linkWorktreeDependencies(ctx.clonePath, ctx.worktreePath, ctx.fsDeps);

    // #region START_WORKSPACE_ASSERT_BOTH_PACKAGES
    assert.strictEqual(
      readlinkSync(join(ctx.worktreePath, 'packages', 'a', 'node_modules')),
      join(ctx.clonePath, 'packages', 'a', 'node_modules')
    );
    assert.strictEqual(
      readlinkSync(join(ctx.worktreePath, 'packages', 'b', 'node_modules')),
      join(ctx.clonePath, 'packages', 'b', 'node_modules')
    );
    // #endregion END_WORKSPACE_ASSERT_BOTH_PACKAGES
  });

  it('does not throw when one candidate fails', () => {
    // failure mode: symlinkSync throws when the destination path already exists as a regular file
    mkdirSync(join(ctx.clonePath, 'node_modules'));
    mkdirSync(join(ctx.clonePath, 'vendor'));
    writeFileSync(join(ctx.worktreePath, 'node_modules'), 'occupied');

    linkWorktreeDependencies(ctx.clonePath, ctx.worktreePath, ctx.fsDeps);

    assert.strictEqual(
      readlinkSync(join(ctx.worktreePath, 'vendor')),
      join(ctx.clonePath, 'vendor')
    );
  });
});
