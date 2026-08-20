// @file: Integration tests for YagniCommand#run — the no-git-HEAD honest no-op (unscoped runs never fall back to scanning the whole untracked tree).
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type YagniModule = typeof import('../yagni.cmd.ts');

let mod: YagniModule;
let origExit: typeof process.exit;
let origArgv: string[];

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'yagni', ...rest];
}

describe('YagniCommand — no git HEAD', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'yagni'];
    mod = await import('../yagni.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
  });

  it('unscoped run on a repo with no git HEAD → honest no-op, exit 0, nothing scanned', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-no-head-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      const r = await mod.run(argv());
      assert.strictEqual(r.exitCode, 0);
      assert.match(r.text, /no git HEAD/);
      assert.match(r.text, /gennady yagni <path>/);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an explicit path is a real scope, not the whole repo — proceeds past the no-HEAD guard', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yagni-no-head-explicit-'));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      const r = await mod.run(argv('.'));
      // No git at all here either, so getChangedSourceFiles legitimately finds nothing — the point
      // of this test is only that it did NOT take the unscoped honest-no-op early return.
      assert.doesNotMatch(r.text, /no git HEAD/);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
