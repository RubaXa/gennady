// @file: Golden snapshot of everything `gennady sync` / `sync-skills` write into a consumer project.
// @consumers: CI
// @tasks: TSK-57, TSK-96

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSkills } from '../cmd/sync-skills/sync-skills-core.ts';
import { scanDirectives } from '../cmd/sync/sync-core.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOLDEN = path.join(REPO_ROOT, 'cli', '__tests__', 'deployed-surface.golden.txt');

/**
 * @purpose Every path `sync` and `sync-skills` would write, in the same shape a project sees them.
 * @invariant Roots match sync.cmd / sync-skills.cmd exactly (`ai/directives`→`ai/directives`,
 *   `ai/skills`→`.claude/skills/<name>`) — a narrower set would not guard what actually ships.
 * @returns Sorted `<target-dir>/<relative-path>` lines.
 */
function deployedSurface(): string[] {
  const skills = scanSkills(path.join(REPO_ROOT, 'ai', 'skills'));
  const skillPaths = [...skills].flatMap(([name, files]) =>
    [...files.keys()].map((rel) => `.claude/skills/${name}/${rel}`)
  );

  const directivePaths = scanDirectives(path.join(REPO_ROOT, 'ai', 'directives')).map(
    (rel) => `ai/directives/${rel}`
  );

  return [...skillPaths, ...directivePaths].sort();
}

describe('deployed surface', () => {
  // A deny-list can only exclude what someone already thought of. `.DS_Store` and `__tests__`
  // were thought of (sync-skills-core.ts EXCLUDED_NAMES + isTestArtifact); this snapshot covers
  // what nobody has thought of yet — the actual failure mode — by making any change to what
  // ships a deliberate, reviewed act.
  it('matches the committed golden file', () => {
    const actual = deployedSurface();

    if (process.env.UPDATE_SURFACE_GOLDEN === '1') {
      fs.writeFileSync(GOLDEN, `${actual.join('\n')}\n`);
      return;
    }

    assert.ok(
      fs.existsSync(GOLDEN),
      `missing ${path.relative(REPO_ROOT, GOLDEN)} — regenerate with UPDATE_SURFACE_GOLDEN=1 npm test`
    );
    const expected = fs.readFileSync(GOLDEN, 'utf-8').trim().split('\n');

    const added = actual.filter((p) => !expected.includes(p));
    const removed = expected.filter((p) => !actual.includes(p));

    assert.deepEqual(
      { added, removed },
      { added: [], removed: [] },
      'The set of files deployed into consumer projects changed.\n' +
        'If that is intended, review the diff and run: UPDATE_SURFACE_GOLDEN=1 npm test\n' +
        `  newly shipped: ${added.join(', ') || '—'}\n` +
        `  no longer shipped: ${removed.join(', ') || '—'}`
    );
  });

  it('ships no test file — those import from this checkout and break a consumer typecheck', () => {
    const offenders = deployedSurface().filter(
      (p) => /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)
    );

    assert.deepEqual(offenders, []);
  });

  it('leaks no developer path into a consumer project', () => {
    const offenders = deployedSurface().filter((p) => p.includes('/Users/') || p.includes('~/'));

    assert.deepEqual(offenders, []);
  });
});
