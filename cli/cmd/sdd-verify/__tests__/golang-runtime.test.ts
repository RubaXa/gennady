import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { golangPluginGates } from '../../../../shared/verify/presets/golang.ts';
import { resolveTreeGuard, treeStatus } from '../../../../shared/verify/tree-guard.ts';
import { allOf, exitCodeMatches } from '../../../../shared/verify/env-fail.ts';
import { defaultAsyncRunner, runGate } from '../sdd-verify.cmd.ts';
import type { Gate, GateRunner } from '../sdd-verify.types.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const TSX_IMPORT = join(REPO_ROOT, 'node_modules/tsx/dist/loader.mjs');
const GENNADY = join(REPO_ROOT, 'cli/gennady.ts');

function cliGate(gate: ReturnType<typeof golangPluginGates>[number]): Gate {
  return {
    name: gate.id,
    stack: gate.stack,
    argv: gate.argv,
    cwd: gate.cwd,
    env: gate.env,
    timeoutMs: gate.timeoutMs,
    envFail: gate.envFail,
    requires: gate.requires,
    outputMeansFailure: gate.outputMeansFailure,
    driftMeansFailure: gate.driftMeansFailure,
    skipped: gate.skipped,
    mutates: false,
    haltsOnFailure: true,
  };
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: root, encoding: 'utf-8' }).trim();
}

function initCommittedRepo(root: string): void {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'tests@example.com']);
  git(root, ['config', 'user.name', 'Tests']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'baseline']);
}

describe('Go V-09 runtime semantics', () => {
  it('public dirty CLI refuses while internal pre-commit mode accepts only a synchronized index', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'go-runtime-cli-index-')));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      initCommittedRepo(root);
      writeFileSync(join(root, 'main.go'), 'package runtime\n// staged candidate\n');
      git(root, ['add', 'main.go']);
      const argv = [
        '--import',
        TSX_IMPORT,
        GENNADY,
        'sdd-verify',
        '--profile',
        'full',
        '--only',
        'generate',
      ];

      const direct = spawnSync(process.execPath, argv, {
        cwd: root,
        encoding: 'utf-8',
        env: { ...process.env, GENNADY_INTERNAL_PRECOMMIT_INDEX: undefined },
      });
      assert.equal(direct.status, 4, `${direct.stdout}${direct.stderr}`);
      assert.match(`${direct.stdout}${direct.stderr}`, /DIRTY_TREE/);

      const preCommit = spawnSync(process.execPath, argv, {
        cwd: root,
        encoding: 'utf-8',
        env: { ...process.env, GENNADY_INTERNAL_PRECOMMIT_INDEX: '1' },
      });
      assert.equal(preCommit.status, 0, `${preCommit.stdout}${preCommit.stderr}`);
      assert.match(preCommit.stdout, /ALL PASS/);
      assert.match(git(root, ['diff', '--cached', '--name-only']), /main\.go/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies module fetch failures as environment failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'go-runtime-env-'));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      const build = golangPluginGates(root, null).find((gate) => gate.id === 'build');
      assert.ok(build);
      const runner: GateRunner = () => ({
        exitCode: 1,
        output: 'go: example.com/missing: dial tcp: no such host',
      });
      assert.equal((await runGate(runner, cliGate(build), 'build')).status, 'env-fail');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats gofmt stdout as a failure even with exit 0', async () => {
    const root = mkdtempSync(join(tmpdir(), 'go-runtime-fmt-'));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      const fmt = golangPluginGates(root, null).find((gate) => gate.id === 'fmt');
      assert.ok(fmt);
      const runner: GateRunner = () => ({
        exitCode: 0,
        output: 'main.go\n',
        stdout: 'main.go\n',
        stderr: '',
      });
      assert.equal((await runGate(runner, cliGate(fmt), 'fmt')).status, 'fail');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes real go generate when it creates only ignored output, and preserves that output', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'go-runtime-ignored-')));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, '.gitignore'), 'gen.out\n');
      writeFileSync(
        join(root, 'main.go'),
        '//go:generate sh -c "echo generated > gen.out"\npackage runtime\n'
      );
      initCommittedRepo(root);
      const generate = golangPluginGates(root, null).find((gate) => gate.id === 'generate');
      assert.ok(generate);
      const tree = resolveTreeGuard(root);
      assert.equal(tree.kind, 'guard');
      if (tree.kind !== 'guard') return;
      try {
        const result = await runGate(defaultAsyncRunner, cliGate(generate), 'generate', tree);
        assert.equal(result.status, 'pass', result.output);
        assert.equal(readFileSync(join(root, 'gen.out'), 'utf-8'), 'generated\n');
        assert.equal(treeStatus(root), '', 'ignored output is not guarded drift');
      } finally {
        tree.guard.release();
      }
      assert.equal(readFileSync(join(root, 'gen.out'), 'utf-8'), 'generated\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails real go generate on tracked drift, names the file/fixer, and rolls back', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'go-runtime-tracked-drift-')));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(
        join(root, 'main.go'),
        '//go:generate sh -c "echo fresh > gen.out"\npackage runtime\n'
      );
      writeFileSync(join(root, 'gen.out'), 'stale\n');
      initCommittedRepo(root);
      const generate = golangPluginGates(root, null).find((gate) => gate.id === 'generate');
      assert.ok(generate);
      const tree = resolveTreeGuard(root);
      assert.equal(tree.kind, 'guard');
      if (tree.kind !== 'guard') return;
      try {
        const result = await runGate(defaultAsyncRunner, cliGate(generate), 'generate', tree);
        assert.equal(result.status, 'fail');
        assert.equal(result.exitCode, 0, result.output);
        assert.match(result.output, /gen\.out/);
        assert.match(result.output, /gennady fix golang:generate/);
        assert.equal(readFileSync(join(root, 'gen.out'), 'utf-8'), 'stale\n');
        assert.equal(treeStatus(root), '');
      } finally {
        tree.guard.release();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const baseline of ['no-git', 'no-HEAD'] as const) {
    it(`returns ENV_FAIL without execution when a drift gate has ${baseline}`, async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), `go-runtime-${baseline}-`)));
      try {
        writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
        writeFileSync(join(root, 'main.go'), '//go:generate generator\npackage runtime\n');
        if (baseline === 'no-HEAD') git(root, ['init', '-q']);
        const generate = golangPluginGates(root, null).find((gate) => gate.id === 'generate');
        assert.ok(generate);
        const tree = resolveTreeGuard(root);
        assert.equal(tree.kind, 'unsandboxed');
        let calls = 0;
        const result = await runGate(
          () => {
            calls++;
            return { exitCode: 0, output: '' };
          },
          cliGate(generate),
          'generate',
          tree
        );
        assert.equal(result.status, 'env-fail');
        assert.equal(calls, 0);
        assert.match(result.output, /git repository|committed HEAD/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('refuses a dirty tree before any gate and leaves tracked/untracked WIP untouched', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'go-runtime-dirty-')));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      initCommittedRepo(root);
      writeFileSync(join(root, 'main.go'), 'package runtime\n// WIP\n');
      writeFileSync(join(root, 'untracked.txt'), 'WIP\n');

      const tree = resolveTreeGuard(root);
      assert.equal(tree.kind, 'error');
      if (tree.kind !== 'error') return;
      assert.match(tree.message, /DIRTY_TREE/);
      assert.match(tree.message, /main\.go/);
      assert.match(tree.message, /untracked\.txt/);
      assert.equal(readFileSync(join(root, 'main.go'), 'utf-8'), 'package runtime\n// WIP\n');
      assert.equal(readFileSync(join(root, 'untracked.txt'), 'utf-8'), 'WIP\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies non-drift mutation as VIOLATION, rolls back, then runs the next gate clean', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'go-runtime-violation-')));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      initCommittedRepo(root);
      const tree = resolveTreeGuard(root);
      assert.equal(tree.kind, 'guard');
      if (tree.kind !== 'guard') return;
      try {
        const mutator: Gate = {
          name: 'golang:mutator',
          stack: 'golang',
          argv: [process.execPath, '-e', "require('node:fs').writeFileSync('junk.txt','junk')"],
          cwd: root,
          mutates: false,
          haltsOnFailure: false,
        };
        const violation = await runGate(defaultAsyncRunner, mutator, 'mutator', tree);
        assert.equal(violation.status, 'violation');
        assert.match(violation.output, /junk\.txt/);
        assert.equal(existsSync(join(root, 'junk.txt')), false);

        const observer: Gate = {
          name: 'golang:observer',
          stack: 'golang',
          argv: [
            process.execPath,
            '-e',
            "process.exit(require('node:fs').existsSync('junk.txt') ? 9 : 0)",
          ],
          cwd: root,
          mutates: false,
          haltsOnFailure: false,
        };
        const next = await runGate(defaultAsyncRunner, observer, 'observer', tree);
        assert.equal(next.status, 'pass', next.output);
        assert.equal(treeStatus(root), '');

        const envFailingMutator: Gate = {
          ...mutator,
          name: 'golang:env-mutator',
          argv: [
            process.execPath,
            '-e',
            "require('node:fs').writeFileSync('junk.txt','junk'); process.exit(7)",
          ],
          envFail: [allOf([exitCodeMatches('==7')], 'synthetic environment failure')],
          driftMeansFailure: true,
        };
        const environmentWins = await runGate(
          defaultAsyncRunner,
          envFailingMutator,
          'env-mutator',
          tree
        );
        assert.equal(environmentWins.status, 'env-fail');
        assert.match(environmentWins.output, /junk\.txt/);
        assert.match(environmentWins.output, /synthetic environment failure/);
        assert.equal(existsSync(join(root, 'junk.txt')), false);
        const afterEnvironment = await runGate(defaultAsyncRunner, observer, 'observer', tree);
        assert.equal(afterEnvironment.status, 'pass', afterEnvironment.output);
        assert.equal(treeStatus(root), '');
      } finally {
        tree.guard.release();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('guards each requires process, rolls back its drift, and never runs main argv', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'go-runtime-requires-')));
    try {
      writeFileSync(join(root, 'go.mod'), 'module example.com/runtime\n\ngo 1.22\n');
      writeFileSync(join(root, 'main.go'), 'package runtime\n');
      initCommittedRepo(root);
      const tree = resolveTreeGuard(root);
      assert.equal(tree.kind, 'guard');
      if (tree.kind !== 'guard') return;
      const mainMarker = join(root, 'MAIN_RAN');
      const observer: Gate = {
        name: 'golang:observer',
        stack: 'golang',
        argv: [
          process.execPath,
          '-e',
          "process.exit(require('node:fs').existsSync('requires-junk.txt') ? 9 : 0)",
        ],
        cwd: root,
        mutates: false,
        haltsOnFailure: false,
      };
      try {
        const failedRequires: Gate = {
          name: 'golang:failed-requires',
          stack: 'golang',
          argv: [process.execPath, '-e', "require('node:fs').writeFileSync('MAIN_RAN','x')"],
          cwd: root,
          requires: [
            {
              argv: [
                process.execPath,
                '-e',
                "require('node:fs').writeFileSync('requires-junk.txt','junk'); process.exit(7)",
              ],
              cwd: root,
              hint: 'install the missing environment dependency',
            },
          ],
          mutates: false,
          haltsOnFailure: false,
        };
        const envFailure = await runGate(
          defaultAsyncRunner,
          failedRequires,
          'failed-requires',
          tree
        );
        assert.equal(envFailure.status, 'env-fail');
        assert.match(envFailure.output, /requires-junk\.txt/);
        assert.match(envFailure.output, /install the missing environment dependency/);
        assert.equal(existsSync(join(root, 'requires-junk.txt')), false);
        assert.equal(existsSync(mainMarker), false);
        assert.equal(
          (await runGate(defaultAsyncRunner, observer, 'observer', tree)).status,
          'pass'
        );

        const successfulMutatingRequires: Gate = {
          ...failedRequires,
          name: 'golang:mutating-requires',
          driftMeansFailure: true,
          requires: [
            {
              argv: [
                process.execPath,
                '-e',
                "require('node:fs').writeFileSync('requires-junk.txt','junk')",
              ],
              cwd: root,
              hint: 'must stay observe-only',
            },
          ],
        };
        const violation = await runGate(
          defaultAsyncRunner,
          successfulMutatingRequires,
          'mutating-requires',
          tree
        );
        assert.equal(violation.status, 'violation');
        assert.match(violation.output, /requires-junk\.txt/);
        assert.equal(existsSync(join(root, 'requires-junk.txt')), false);
        assert.equal(existsSync(mainMarker), false);
        assert.equal(
          (await runGate(defaultAsyncRunner, observer, 'observer', tree)).status,
          'pass'
        );
        assert.equal(treeStatus(root), '');
      } finally {
        tree.guard.release();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
