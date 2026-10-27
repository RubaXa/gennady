// @file: Phase-correct spec readiness rejects bad artifacts without changing their bytes.
// @spec: AI-SKILLS
// @consumers: quality-gate; CLI authoring scenarios; fixture provisioner

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkAuthoringReadiness } from '../quality-gate.ts';
import { FIXTURE_FILES } from '../provision.ts';
import { checkSpecAuthoringDraft, checkSpecHierarchy } from '../../../shared/sdd/check.ts';

it('grades real completed scope/module artifacts, not nonexistent implementation tickets', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-authoring-readiness-'));
  const paths = ['specs/fibonacci/fibonacci.spec.md', 'specs/fibonacci/nth/nth.spec.md'];
  const source = new URL(
    '../../../shared/sdd/__tests__/fixtures/spec-authoring/valid/',
    import.meta.url
  );
  const scope =
    '<!--SECTION:SPEC_ID-->\nFIB\n<!--/SECTION:SPEC_ID-->\n' +
    readFileSync(new URL('fibonacci.scope.spec.md', source), 'utf8');
  const module =
    '<!--SECTION:SPEC_ID-->\nNTH\n<!--/SECTION:SPEC_ID-->\n' +
    readFileSync(new URL('nth.module.spec.md', source), 'utf8');
  const put = (file: string, text: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  try {
    put(paths[0], scope);
    put(paths[1], module);
    const initial = paths.map((file) => readFileSync(join(root, file)));
    assert.equal(checkAuthoringReadiness(root, paths).pass, true);
    for (const [index, file] of paths.entries())
      assert.deepEqual(readFileSync(join(root, file)), initial[index]);
    assert.equal(checkAuthoringReadiness(root, []).pass, false);
    assert.equal(checkAuthoringReadiness(root, [paths[0], paths[0]]).pass, false);
    assert.equal(checkAuthoringReadiness(root, ['../outside.spec.md']).pass, false);
    assert.equal(checkAuthoringReadiness(root, ['specs/missing.spec.md']).pass, false);
    symlinkSync(join(root, paths[0]), join(root, 'alias.spec.md'));
    assert.equal(checkAuthoringReadiness(root, ['alias.spec.md']).pass, false);
    put(paths[1], '# Empty module');
    assert.equal(checkAuthoringReadiness(root, paths).pass, false);
    put(paths[1], '<!--SECTION:SPEC_ID-->\nEMPTY\n<!--/SECTION:SPEC_ID-->');
    assert.equal(checkAuthoringReadiness(root, paths).pass, false);
    put(paths[1], module + '\n<!--SECTION:SPEC_ID-->\nEXTRA\n<!--/SECTION:SPEC_ID-->');
    assert.equal(checkAuthoringReadiness(root, paths).pass, false);
    put(paths[1], module + '\n<!--SECTION:SCOPE_TYPE-->\nlibrary\n<!--/SECTION:SCOPE_TYPE-->');
    assert.equal(checkAuthoringReadiness(root, paths).pass, false);
    put(paths[0], scope.replace('\nlibrary\n', '\nunknown\n'));
    put(paths[1], module);
    assert.equal(checkAuthoringReadiness(root, paths).pass, false);
    put(paths[0], scope);
    put(paths[1], module + '\n<!-- unfinished skeleton -->\n');
    assert.equal(checkAuthoringReadiness(root, paths).pass, false);
    put(
      paths[1],
      module.replace(
        /<!--SECTION:SPEC_ID-->[\s\S]*?<!--\/SECTION:SPEC_ID-->/,
        scope.match(/<!--SECTION:SPEC_ID-->[\s\S]*?<!--\/SECTION:SPEC_ID-->/)![0]
      )
    );
    assert.match(checkAuthoringReadiness(root, paths).detail, /duplicate SPEC_ID/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('recovers truthful ownership for fixture runners instead of opting them out of checks', () => {
  const files = FIXTURE_FILES['fibonacci-library'];
  const spec = 'specs/eval-tools/eval-tools.spec.md';
  assert.deepEqual(checkSpecAuthoringDraft(spec, files[spec]), []);
  assert.match(files['scripts/test.mjs'], /@spec: ET/);
  assert.match(files['scripts/test-coverage.mjs'], /@spec: ET/);
  assert.match(files[spec], /scripts\/test\.mjs/);
  assert.match(files[spec], /scripts\/test-coverage\.mjs/);
  assert.match(files['specs/README.md'], /eval-tools/);
  assert.doesNotMatch(files[spec], /Status:\*\* approved|Operator decision:\*\* approved/);
  assert.deepEqual(
    checkSpecHierarchy([{ file: spec, content: files[spec], flowVersion: 'v2' }]),
    []
  );
});

it('the real CLI resolves both recovered owners and still refuses ticket completion before decomposition', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-owned-toolchain-'));
  try {
    for (const [file, content] of Object.entries(FIXTURE_FILES['fibonacci-library'])) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    const run = () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          fileURLToPath(new URL('../../../cli/gennady.ts', import.meta.url)),
          'sdd-check',
          '--all',
          '.',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 20000,
          env: { ...process.env, GENNADY_NO_UPDATE_CHECK: '1' },
        }
      );
    const check = run();
    assert.equal(check.status, 2, check.stdout + check.stderr);
    assert.match(check.stdout + check.stderr, /SDD_NO_TICKETS_FOUND/);
    assert.doesNotMatch(check.stdout + check.stderr, /SDD_FILE_SPEC_OWNER_UNRESOLVED/);
    const runner = join(root, 'scripts/test.mjs');
    writeFileSync(runner, readFileSync(runner, 'utf8').replace('@spec: ET', '@spec: MISSING'));
    const negative = run();
    assert.notEqual(negative.status, 0);
    assert.match(negative.stdout + negative.stderr, /SDD_FILE_SPEC_OWNER_UNRESOLVED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
