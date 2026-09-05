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
const MARKER_REL = '.gennady-directive-assembly.json';
// A build-produced file that exists in every rebuild — used as the target for the fixtures below.
const SAMPLE_REL = join('sdd-v2', 'router.directive.xml');

describe('checkDirectivesFresh', () => {
  let lazyFixture: string;
  let monolithFixture: string;

  function buildFixture(assembly: 'lazy' | 'monolith'): string {
    const fixture = mkdtempSync(join(tmpdir(), `gennady-${assembly}-fixture-`));
    const build = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        join(ROOT, 'ai/kit/build-directives.ts'),
        `--out=${fixture}`,
        `--assembly=${assembly}`,
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(build.status, 0, `fixture build failed:\n${build.stdout}\n${build.stderr}`);
    return fixture;
  }

  before(() => {
    lazyFixture = buildFixture('lazy');
    monolithFixture = buildFixture('monolith');
  });

  after(() => {
    rmSync(lazyFixture, { recursive: true, force: true });
    rmSync(monolithFixture, { recursive: true, force: true });
  });

  it('compares a lazy-marked tree against a lazy rebuild', () => {
    const result = checkDirectivesFresh(ROOT, lazyFixture);
    assert.equal(result.fresh, true, result.diff);
  });

  it('compares a monolith-marked tree against a monolith rebuild', () => {
    const result = checkDirectivesFresh(ROOT, monolithFixture);
    assert.equal(result.fresh, true, result.diff);
  });

  it('catches a generated file hand-edited after the build ran', () => {
    const target = join(lazyFixture, SAMPLE_REL);
    const original = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${original}\n<!-- hand-edited directly, should never happen -->\n`);
      const result = checkDirectivesFresh(ROOT, lazyFixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /router\.directive\.xml/);
    } finally {
      writeFileSync(target, original);
    }
  });

  it('catches a generated file missing from the checked-in tree (built but never committed)', () => {
    const target = join(lazyFixture, SAMPLE_REL);
    const original = readFileSync(target, 'utf8');
    try {
      rmSync(target);
      const result = checkDirectivesFresh(ROOT, lazyFixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /router\.directive\.xml/);
    } finally {
      writeFileSync(target, original);
    }
  });

  it('ignores a hand-authored file that sits next to generated ones but is never templated', () => {
    const strayFile = join(lazyFixture, 'coding', 'README.md');
    mkdirSync(join(lazyFixture, 'coding'), { recursive: true });
    writeFileSync(strayFile, '# not a build output — hand-maintained companion doc\n');
    const result = checkDirectivesFresh(ROOT, lazyFixture);
    assert.equal(result.fresh, true, result.diff);
  });

  it('rejects a stale lazy step package when the selected assembly emits that directive monolithically', () => {
    const stale = join(monolithFixture, 'sdd-v2/router/steps/STALE.xml');
    mkdirSync(join(monolithFixture, 'sdd-v2/router/steps'), { recursive: true });
    writeFileSync(stale, '<Step id="STALE"/>\n');
    try {
      const result = checkDirectivesFresh(ROOT, monolithFixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /STALE\.xml/);
    } finally {
      rmSync(join(monolithFixture, 'sdd-v2/router'), { recursive: true, force: true });
    }
  });

  it('fails closed with an exact repair when the assembly marker is missing', () => {
    const marker = join(lazyFixture, MARKER_REL);
    const original = readFileSync(marker, 'utf8');
    try {
      rmSync(marker);
      const result = checkDirectivesFresh(ROOT, lazyFixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /ERR_DIRECTIVE_ASSEMBLY_MARKER_MISSING/);
      assert.match(result.diff, /Next: rebuild with an explicit intended assembly/);
    } finally {
      writeFileSync(marker, original);
    }
  });

  it('fails closed with an exact repair when the assembly marker is invalid', () => {
    const marker = join(lazyFixture, MARKER_REL);
    const original = readFileSync(marker, 'utf8');
    try {
      writeFileSync(marker, '{"schema":"wrong","selection":"lazy"}\n');
      const result = checkDirectivesFresh(ROOT, lazyFixture);
      assert.equal(result.fresh, false);
      assert.match(result.diff, /ERR_DIRECTIVE_ASSEMBLY_MARKER_INVALID/);
      assert.match(result.diff, /Next: rebuild with an explicit intended assembly/);
    } finally {
      writeFileSync(marker, original);
    }
  });
});
