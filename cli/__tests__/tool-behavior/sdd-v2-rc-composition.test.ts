// @file: Release-candidate proof that standalone read boundaries fail closed.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

describe('SDD v2 release-candidate composition', () => {
  it('fails closed at standalone read boundaries instead of treating symlink/outside evidence as empty-clean', () => {
    const { root } = buildRepoFixture({
      scripts: {},
      files: {
        'src/safe.ts': '// @file: Safe source.\n// @consumers: N/A\nexport const safe = 1;\n',
        'coverage/coverage-final.json': JSON.stringify({
          'src/safe.ts': { s: { '0': 1 }, b: {}, f: {} },
        }),
      },
    });
    const { root: victimRoot } = buildRepoFixture({
      scripts: {},
      files: { 'victim.ts': 'export const victim = "unchanged";\n' },
    });
    try {
      const victim = join(victimRoot, 'victim.ts');
      const before = readFileSync(victim, 'utf-8');
      mkdirSync(join(root, 'specs'), { recursive: true });
      symlinkSync(victim, join(root, 'specs', 'linked.spec.md'), 'file');
      symlinkSync(victim, join(root, 'linked.task.TSK-boundary.md'), 'file');
      symlinkSync('.', join(root, 'repo-alias'), 'dir');
      symlinkSync(victim, join(root, 'src', 'linked.ts'), 'file');
      symlinkSync(join(root, 'src'), join(root, 'src-alias'), 'dir');

      for (const invocation of [
        ['sdd-check', '--all'],
        ['sdd-check', '--task', 'linked.task.TSK-boundary.md'],
        ['sdd-check', '--changed', 'repo-alias'],
      ]) {
        const result = runCli(invocation, root);
        assert.strictEqual(result.exitCode, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /ERR_CLI_SDD_CHECK_READ_FAILED/);
        assert.doesNotMatch(result.stdout + result.stderr, /✅ clean/);
      }

      for (const target of ['src/linked.ts', 'src-alias', 'src']) {
        const result = runCli(['lint', target], root);
        assert.strictEqual(result.exitCode, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /ERR_CLI_LINT_READ_FAILED/);
        assert.doesNotMatch(result.stdout + result.stderr, /linting → clean/);
      }

      for (const target of ['src/linked.ts', victim]) {
        const result = runCli(['testcov', '--min=0', target], root);
        assert.strictEqual(result.exitCode, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /ERR_CLI_TESTCOV_TARGET_PATH/);
      }

      const validFile = runCli(['testcov', '--min=0', 'src/safe.ts'], root);
      assert.strictEqual(validFile.exitCode, 0, validFile.stdout + validFile.stderr);
      assert.strictEqual(
        readFileSync(victim, 'utf-8'),
        before,
        'external victim must stay untouched'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(victimRoot, { recursive: true, force: true });
    }
  });
});
