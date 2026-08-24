// @file: Freshness-gate tests — a hand-edited or missing generated file under ai/directives/
//         must be caught by comparing against a real rebuild.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkDirectivesFresh } from '../check-directives-fresh.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
// A build-produced file that exists in every rebuild — used as the target for the fixtures below.
const SAMPLE_REL = join('sdd-v2', 'router.directive.xml');

describe('checkDirectivesFresh', () => {
  let fixture: string;

  before(() => {
    // A real rebuild, captured once into a scratch dir the tests can mutate freely — this is
    // "what a correct ai/directives/ looks like right now", independent of whatever the real
    // checked-in tree happens to contain at test time.
    fixture = mkdtempSync(join(tmpdir(), 'gennady-fixture-'));
    const build = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(ROOT, 'ai/kit/build-directives.ts'), `--out=${fixture}`],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(build.status, 0, `fixture build failed:\n${build.stdout}\n${build.stderr}`);
  });

  after(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('reports fresh when the tree is exactly a fresh rebuild', () => {
    const result = checkDirectivesFresh(ROOT, fixture);
    assert.equal(result.fresh, true, result.diff);
  });

  it('catches a generated file hand-edited after the build ran', () => {
    const target = join(fixture, SAMPLE_REL);
    const original = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${original}\n<!-- hand-edited directly, should never happen -->\n`);
      const result = checkDirectivesFresh(ROOT, fixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /router\.directive\.xml/);
    } finally {
      writeFileSync(target, original);
    }
  });

  it('catches a generated file missing from the checked-in tree (built but never committed)', () => {
    const target = join(fixture, SAMPLE_REL);
    const original = readFileSync(target, 'utf8');
    try {
      rmSync(target);
      const result = checkDirectivesFresh(ROOT, fixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /router\.directive\.xml/);
    } finally {
      writeFileSync(target, original);
    }
  });

  it('ignores a hand-authored file that sits next to generated ones but is never templated', () => {
    const strayFile = join(fixture, 'coding', 'README.md');
    mkdirSync(join(fixture, 'coding'), { recursive: true });
    writeFileSync(strayFile, '# not a build output — hand-maintained companion doc\n');
    const result = checkDirectivesFresh(ROOT, fixture);
    assert.equal(result.fresh, true, result.diff);
  });
});
