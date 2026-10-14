// @file: UV-23 data-only Verify extension boundary consumer contract.
// @spec: CLI-VERIFY
// @consumers: CI

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { runVerifyCommand } from '../../../cli/cmd/verify/verify.cmd.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const FIXTURE_ROOT = path.join(import.meta.dirname, 'fixtures', 'declarative-plugin-consumer');

function git(root: string, ...args: readonly string[]): string {
  return execFileSync(
    'git',
    ['-C', root, '-c', 'user.email=verify@test', '-c', 'user.name=verify', ...args],
    { encoding: 'utf8' }
  ).trim();
}

function consumerFixture(): { readonly root: string; readonly cleanup: () => void } {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-plugin-boundary-'));
  const root = path.join(parent, 'repo');
  fs.cpSync(FIXTURE_ROOT, root, { recursive: true });
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  return {
    root: fs.realpathSync(root),
    cleanup: () => fs.rmSync(parent, { recursive: true, force: true }),
  };
}

describe('UV-23 data-only Verify plugin boundary', () => {
  it('executes a project-authored argv step only through the common guarded executor', async () => {
    const fixture = consumerFixture();
    try {
      const result = await runVerifyCommand(
        fixture.root,
        { phase: 'consumer', planOnly: false, format: 'json' },
        { homeDirectory: path.join(fixture.root, '.home') }
      );

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.report?.verdict, 'pass');
      assert.deepEqual(
        result.report?.plan.steps.map((step) => step.id),
        ['node:consumer-command']
      );
      assert.equal(result.report?.plan.steps[0]?.provenance, 'gennady.yaml');
      assert.equal(result.report?.results[0]?.status, 'pass');
      assert.equal(
        fs.readFileSync(path.join(fixture.root, 'custom-output.txt'), 'utf8'),
        'executed by the common Verify executor\n'
      );
      assert.ok(
        result.report?.mutations.some(
          (mutation) =>
            mutation.stepId === 'node:consumer-command' &&
            mutation.path === 'custom-output.txt' &&
            mutation.allowed
        )
      );
      const projected = JSON.parse(result.stdout) as {
        plan: { steps: Array<{ id: string; provenance?: string }> };
      };
      assert.deepEqual(
        projected.plan.steps.map(({ id, provenance }) => ({ id, provenance })),
        [{ id: 'node:consumer-command', provenance: 'gennady.yaml' }]
      );
      assert.doesNotMatch(result.stdout, /consumer-command\.mjs/);
      assert.doesNotMatch(
        result.stdout,
        new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects path/package/URL executable plugin declarations before import or spawn', async () => {
    const fixture = consumerFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.root, 'gennady.yaml'),
        [
          'verify:',
          '  pluginUrl: https://plugins.invalid/external.mjs',
          '  presets:',
          '    external:',
          '      package: external-verify-plugin',
          '      path: ./external-plugin.mjs',
          '',
        ].join('\n')
      );

      const result = await runVerifyCommand(
        fixture.root,
        { phase: 'code', planOnly: false, format: 'json' },
        { homeDirectory: path.join(fixture.root, '.home') }
      );

      assert.equal(result.exitCode, 4);
      assert.match(result.stderr, /VERIFY_CONFIG_EXECUTABLE_PLUGIN_FORBIDDEN/);
      assert.match(result.stderr, /data-only command\.argv/);
      assert.equal(result.report, undefined);
      assert.equal(fs.existsSync(path.join(fixture.root, 'external-plugin-imported')), false);
      assert.equal(fs.existsSync(path.join(fixture.root, 'custom-output.txt')), false);
    } finally {
      fixture.cleanup();
    }
  });
});
