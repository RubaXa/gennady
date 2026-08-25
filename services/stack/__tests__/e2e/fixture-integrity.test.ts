// @file: Fixture integrity — every fixture file must be committed, or the suite is red on a clone.
// @consumers: CI
// @tasks: TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { resolvePlugins } = await import('../../../plugins/resolve-plugins.ts');

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

/** Fixture roots: the repo-level suites plus whatever each plugin declares. */
function fixtureRoots(): string[] {
  const { plugins } = resolvePlugins([path.join(REPO_ROOT, 'plugins')], 'stack');
  return [
    path.join(REPO_ROOT, 'services/stack/__tests__/e2e/fixtures'),
    ...plugins.map((plugin) => plugin.e2eFixtures).filter((dir): dir is string => dir !== null),
  ];
}

/** @purpose Paths git refuses to track under a root, whether merely untracked or ignored. */
function uncommitted(root: string, extra: readonly string[]): string[] {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard', ...extra, root], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  return out.split('\n').filter((line) => line.length > 0);
}

describe('e2e fixture integrity', () => {
  it('finds the fixture roots', () => {
    const roots = fixtureRoots();
    // Without this floor the checks below pass over an empty list (plugins.spec §6.2).
    assert.ok(
      roots.length >= 4,
      `expected the repo suite plus one per plugin, got ${roots.length}`
    );
  });

  it('commits every fixture file, so a fresh clone runs the same suite', () => {
    // A `.gennadyrc` fixture is exactly what an ignore rule swallows: the file works on the
    // author's disk and is absent for everyone else, which made config-e2e red from any clone.
    for (const root of fixtureRoots()) {
      assert.deepStrictEqual(
        uncommitted(root, []),
        [],
        `untracked fixture files under ${path.relative(REPO_ROOT, root)}`
      );
      assert.deepStrictEqual(
        uncommitted(root, ['--ignored']),
        [],
        `ignored fixture files under ${path.relative(REPO_ROOT, root)} — add a negation to .gitignore`
      );
    }
  });
});
