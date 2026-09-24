// @file: Adversarial contracts for the dirty-safe target WorkspaceGuard.
// @spec: CLI-VERIFY
// @consumers: CI

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import type { PlannedVerifyStep } from '../../model/verify-step.type.ts';
import { acquireWorkspaceGuard } from '../workspace-guard.ts';

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf-8',
  }).trim();
}

function createRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-guard-'));
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'committed\n');
  fs.writeFileSync(path.join(root, 'rename-me.txt'), 'rename baseline\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'initial');
  return root;
}

function withRepo<T>(run: (root: string) => T): T {
  const root = createRepo();
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function step(
  root: string,
  effect: PlannedVerifyStep['effect'],
  include: readonly string[] = []
): PlannedVerifyStep {
  return {
    id: 'node:format-fix',
    plugin: 'node',
    tags: ['code'],
    needs: [],
    executor: 'local',
    effect,
    command: { argv: ['true'], cwd: root, timeoutMs: 1_000 },
    requires: [],
    ...(include.length > 0 ? { writes: { root, include } } : {}),
    timeoutMs: 1_000,
    onFailure: 'stop-phase',
  };
}

function acquire(root: string) {
  const result = acquireWorkspaceGuard(root, { signalHandlers: false });
  assert.equal(result.kind, 'guard', result.kind === 'error' ? result.error.message : undefined);
  if (result.kind !== 'guard') throw result.error;
  return result.guard;
}

function lockPath(root: string): string {
  return path.join(root, '.git', 'gennady-workspace-guard.lock');
}

function checkpointOf(root: string): {
  directory: string;
  manifest: {
    entries: Record<string, { kind: string; blob?: string }>;
  };
} {
  const parent = path.join(root, '.git', 'gennady-workspace-checkpoints');
  const ids = fs.readdirSync(parent);
  assert.equal(ids.length, 1);
  const directory = path.join(parent, ids[0]);
  return {
    directory,
    manifest: JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf-8')),
  };
}

describe('WorkspaceGuard checkpoint and write policy', () => {
  it('preserves dirty tracked, staged, and untracked agent changes byte-for-byte', () => {
    withRepo((root) => {
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'staged agent change\n');
      git(root, 'add', 'tracked.txt');
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'unstaged agent change\n');
      fs.writeFileSync(path.join(root, 'agent-untracked.txt'), 'untracked agent change\n');
      const indexBefore = fs.readFileSync(path.join(root, '.git', 'index'));

      const guard = acquire(root);
      assert.deepEqual(guard.beginStep(step(root, 'observe')), { kind: 'ready' });
      fs.writeFileSync(path.join(root, 'gate-junk.txt'), 'unexpected gate write\n');
      const outcome = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(outcome.kind, 'violation');
      assert.deepEqual(
        outcome.mutations.map((mutation) => mutation.path),
        ['gate-junk.txt']
      );
      assert.deepEqual(guard.release(), { kind: 'released' });

      assert.equal(
        fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'),
        'unstaged agent change\n'
      );
      assert.equal(
        fs.readFileSync(path.join(root, 'agent-untracked.txt'), 'utf-8'),
        'untracked agent change\n'
      );
      assert.deepEqual(fs.readFileSync(path.join(root, '.git', 'index')), indexBefore);
      assert.match(git(root, 'diff', '--cached', '--name-only'), /tracked\.txt/);
      assert.equal(fs.existsSync(path.join(root, 'gate-junk.txt')), false);
    });
  });

  it('accepts declared repair writes and advances the checkpoint', () => {
    withRepo((root) => {
      const guard = acquire(root);
      guard.beginStep(step(root, 'repair', ['tracked.txt']));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'valid repair\n');
      const accepted = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(
        accepted.kind,
        'accepted',
        accepted.kind === 'error' ? accepted.error.message : undefined
      );
      assert.deepEqual(accepted.mutations, [
        {
          path: 'tracked.txt',
          stepId: 'node:format-fix',
          kind: 'modified',
          allowed: true,
        },
      ]);

      guard.beginStep(step(root, 'observe'));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'unexpected later write\n');
      const rejected = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(rejected.kind, 'violation');
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'valid repair\n');
      guard.release();
    });
  });

  it('restores unexpected create, delete, and rename exactly and reports deterministic evidence', () => {
    withRepo((root) => {
      const guard = acquire(root);
      guard.beginStep(step(root, 'repair', ['tracked.txt']));
      fs.writeFileSync(path.join(root, 'created.txt'), 'created\n');
      fs.rmSync(path.join(root, 'tracked.txt'));
      fs.renameSync(path.join(root, 'rename-me.txt'), path.join(root, 'renamed.txt'));

      const outcome = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(
        outcome.kind,
        'violation',
        outcome.kind === 'error' ? outcome.error.message : undefined
      );
      assert.deepEqual(
        outcome.mutations.map(({ path: changedPath, kind, allowed }) => ({
          path: changedPath,
          kind,
          allowed,
        })),
        [
          { path: 'created.txt', kind: 'created', allowed: false },
          { path: 'renamed.txt', kind: 'renamed', allowed: false },
          { path: 'tracked.txt', kind: 'deleted', allowed: true },
        ]
      );
      assert.equal(fs.existsSync(path.join(root, 'created.txt')), false);
      assert.equal(fs.existsSync(path.join(root, 'renamed.txt')), false);
      assert.equal(fs.readFileSync(path.join(root, 'rename-me.txt'), 'utf-8'), 'rename baseline\n');
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
      guard.release();
    });
  });

  it('rolls back partial writes from a failed repair even when they are declared', () => {
    withRepo((root) => {
      const guard = acquire(root);
      guard.beginStep(step(root, 'repair', ['tracked.txt']));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'partial\n');
      const outcome = guard.finishStep('node:format-fix', { succeeded: false });
      assert.equal(
        outcome.kind,
        'rolled-back',
        outcome.kind === 'error' ? outcome.error.message : undefined
      );
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
      guard.release();
    });
  });

  it('applies exclude after include and forbids every non-repair effect from writing', () => {
    withRepo((root) => {
      const repair = step(root, 'repair', ['**/*.txt']);
      const guardedRepair = {
        ...repair,
        writes: { root, include: ['**/*.txt'], exclude: ['.git/**', 'tracked.txt'] },
      } satisfies PlannedVerifyStep;
      const guard = acquire(root);
      guard.beginStep(guardedRepair);
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'excluded write\n');
      const excluded = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(excluded.kind, 'violation');
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
      guard.release();
    });

    for (const effect of ['observe', 'drift-signal', 'remote-watch'] as const) {
      withRepo((root) => {
        const guard = acquire(root);
        guard.beginStep(step(root, effect));
        fs.writeFileSync(path.join(root, 'tracked.txt'), `${effect}\n`);
        const outcome = guard.finishStep('node:format-fix', { succeeded: true });
        assert.equal(outcome.kind, 'violation');
        assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
        guard.release();
      });
    }
  });

  it('matches the Node, Go, Swift, and configured write-boundary glob dialect', () => {
    withRepo((root) => {
      fs.mkdirSync(path.join(root, 'pkg'));
      fs.mkdirSync(path.join(root, 'Sources'));
      fs.mkdirSync(path.join(root, 'src', 'app'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src', 'vendor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'source.ts'), 'const source = 1;\n');
      fs.writeFileSync(path.join(root, 'pkg', 'main.go'), 'package main\n');
      fs.writeFileSync(path.join(root, 'Sources', 'App.swift'), 'let app = 1\n');
      fs.writeFileSync(path.join(root, 'src', 'app', 'file1.ts'), 'const app = 1;\n');
      fs.writeFileSync(path.join(root, 'src', 'vendor', 'file2.ts'), 'const vendor = 1;\n');
      const guard = acquire(root);

      const node = {
        ...step(root, 'repair'),
        writes: {
          root,
          include: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
          exclude: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
        },
      } satisfies PlannedVerifyStep;
      assert.deepEqual(guard.beginStep(node), { kind: 'ready' });
      fs.writeFileSync(path.join(root, 'source.ts'), 'const source = 2;\n');
      assert.equal(guard.finishStep(node.id, { succeeded: true }).kind, 'accepted');

      const golang = {
        ...step(root, 'repair'),
        writes: {
          root,
          include: ['**/*.go'],
          exclude: ['.git/**', 'vendor/**', '**/testdata/**', 'node_modules/**'],
        },
      } satisfies PlannedVerifyStep;
      assert.deepEqual(guard.beginStep(golang), { kind: 'ready' });
      fs.writeFileSync(path.join(root, 'pkg', 'main.go'), 'package fixed\n');
      assert.equal(guard.finishStep(golang.id, { succeeded: true }).kind, 'accepted');

      const swift = {
        ...step(root, 'repair'),
        writes: { root, include: ['Sources/App.swift'] },
      } satisfies PlannedVerifyStep;
      assert.deepEqual(guard.beginStep(swift), { kind: 'ready' });
      fs.writeFileSync(path.join(root, 'Sources', 'App.swift'), 'let app = 2\n');
      assert.equal(guard.finishStep(swift.id, { succeeded: true }).kind, 'accepted');

      const configured = {
        ...step(root, 'repair'),
        writes: {
          root,
          include: ['src/*/file?.ts'],
          exclude: ['src/vendor/**'],
        },
      } satisfies PlannedVerifyStep;
      assert.deepEqual(guard.beginStep(configured), { kind: 'ready' });
      fs.writeFileSync(path.join(root, 'src', 'app', 'file1.ts'), 'const app = 2;\n');
      assert.equal(guard.finishStep(configured.id, { succeeded: true }).kind, 'accepted');

      assert.deepEqual(guard.beginStep(configured), { kind: 'ready' });
      fs.writeFileSync(path.join(root, 'src', 'vendor', 'file2.ts'), 'const vendor = 2;\n');
      assert.equal(guard.finishStep(configured.id, { succeeded: true }).kind, 'violation');
      guard.release();
    });
  });

  it('rejects a write boundary that traverses a symlink or escapes the repository', () => {
    withRepo((root) => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-guard-outside-'));
      try {
        fs.writeFileSync(path.join(outside, 'external.ts'), 'outside\n');
        fs.symlinkSync(outside, path.join(root, 'linked'));
        const guard = acquire(root);

        const symlink = guard.beginStep(step(root, 'repair', ['linked/external.ts']));
        assert.equal(symlink.kind, 'error');
        if (symlink.kind === 'error')
          assert.equal(symlink.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');

        const wildcard = guard.beginStep(step(root, 'repair', ['**/*.ts']));
        assert.equal(wildcard.kind, 'error');
        if (wildcard.kind === 'error') {
          assert.equal(wildcard.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
        }

        const gitMetadata = guard.beginStep(step(root, 'repair', ['.git/**']));
        assert.equal(gitMetadata.kind, 'error');
        if (gitMetadata.kind === 'error') {
          assert.equal(gitMetadata.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
        }

        for (const include of [
          '.git',
          '[.]git',
          '.git/config',
          '.git/objects/foo',
          '.g?t/config',
        ]) {
          const exactGitMetadata = guard.beginStep(step(root, 'repair', [include]));
          assert.equal(exactGitMetadata.kind, 'error');
          if (exactGitMetadata.kind === 'error') {
            assert.equal(exactGitMetadata.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
          }
        }

        const broadGitMetadata = guard.beginStep(
          step(root, 'repair', ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'])
        );
        assert.equal(broadGitMetadata.kind, 'error');
        if (broadGitMetadata.kind === 'error') {
          assert.equal(broadGitMetadata.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
        }

        const gitDirectoryRoot = {
          ...step(root, 'repair', ['HEAD']),
          writes: { root: path.join(root, '.git'), include: ['HEAD'] },
        } satisfies PlannedVerifyStep;
        const actualGitDirectory = guard.beginStep(gitDirectoryRoot);
        assert.equal(actualGitDirectory.kind, 'error');
        if (actualGitDirectory.kind === 'error') {
          assert.equal(actualGitDirectory.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
        }

        const escapedStep = {
          ...step(root, 'repair', ['external.ts']),
          writes: { root: outside, include: ['external.ts'] },
        } satisfies PlannedVerifyStep;
        const escaped = guard.beginStep(escapedStep);
        assert.equal(escaped.kind, 'error');
        if (escaped.kind === 'error')
          assert.equal(escaped.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
        guard.release();
        assert.equal(fs.readFileSync(path.join(outside, 'external.ts'), 'utf-8'), 'outside\n');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it('rejects ignored symlink traversal without walking its target, unless its subtree is excluded', () => {
    withRepo((root) => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-guard-ignored-link-'));
      try {
        fs.writeFileSync(path.join(outside, 'external.ts'), 'outside\n');
        fs.appendFileSync(path.join(root, '.gitignore'), 'linked\n');
        fs.symlinkSync(outside, path.join(root, 'linked'));
        const guard = acquire(root);

        const exact = guard.beginStep(step(root, 'repair', ['linked/external.ts']));
        assert.equal(exact.kind, 'error');
        if (exact.kind === 'error') {
          assert.equal(exact.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
        }

        const broad = {
          ...step(root, 'repair'),
          writes: {
            root,
            include: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
            exclude: ['.git/**'],
          },
        } satisfies PlannedVerifyStep;
        const unsafeBroad = guard.beginStep(broad);
        assert.equal(unsafeBroad.kind, 'error');
        if (unsafeBroad.kind === 'error') {
          assert.equal(unsafeBroad.error.code, 'VERIFY_WRITE_BOUNDARY_UNSAFE');
          assert.match(unsafeBroad.error.message, /symlink linked/);
        }

        const excluded = {
          ...broad,
          writes: { ...broad.writes, exclude: ['.git/**', 'linked/**'] },
        } satisfies PlannedVerifyStep;
        assert.deepEqual(guard.beginStep(excluded), { kind: 'ready' });
        assert.deepEqual(guard.release(), { kind: 'released' });
        assert.equal(fs.readFileSync(path.join(outside, 'external.ts'), 'utf-8'), 'outside\n');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it('preserves ignored outputs but still catches tracked files matched by ignore rules', () => {
    withRepo((root) => {
      fs.appendFileSync(path.join(root, '.gitignore'), 'tracked.txt\n');
      git(root, 'add', '.gitignore');
      git(root, 'commit', '-qm', 'extend ignore');
      const guard = acquire(root);
      guard.beginStep(step(root, 'observe'));
      fs.mkdirSync(path.join(root, 'ignored'));
      fs.writeFileSync(path.join(root, 'ignored', 'result.log'), 'retained output\n');
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked drift\n');

      const outcome = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(outcome.kind, 'violation');
      assert.deepEqual(
        outcome.mutations.map((mutation) => mutation.path),
        ['tracked.txt']
      );
      assert.equal(
        fs.readFileSync(path.join(root, 'ignored', 'result.log'), 'utf-8'),
        'retained output\n'
      );
      guard.release();
    });
  });

  it('restores workspace and index on cancellation with POSIX exit codes', () => {
    for (const [signal, exitCode] of [
      ['SIGINT', 130],
      ['SIGTERM', 143],
    ] as const) {
      withRepo((root) => {
        const guard = acquire(root);
        guard.beginStep(step(root, 'repair', ['tracked.txt']));
        fs.writeFileSync(path.join(root, 'tracked.txt'), 'interrupted\n');
        git(root, 'add', 'tracked.txt');
        const result = guard.cancel(signal);
        assert.deepEqual(result, { kind: 'cancelled', exitCode });
        assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
        assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
        assert.equal(fs.existsSync(lockPath(root)), false);
      });
    }
  });

  it('arms the default SIGTERM handler before returning the acquired guard', async () => {
    const root = createRepo();
    try {
      await new Promise<void>((resolve, reject) => {
        const moduleUrl = new URL('../workspace-guard.ts', import.meta.url).href;
        const script = [
          "import fs from 'node:fs';",
          "import path from 'node:path';",
          'const { acquireWorkspaceGuard } = await import(process.env.GUARD_MODULE);',
          'const result = acquireWorkspaceGuard(process.env.GUARD_ROOT);',
          "if (result.kind !== 'guard') throw new Error(result.error.message);",
          "fs.writeFileSync(path.join(process.env.GUARD_ROOT, 'tracked.txt'), 'signal debris\\n');",
          "process.stdout.write('ready\\n');",
          'setInterval(() => {}, 1_000);',
        ].join('\n');
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '--eval', script],
          {
            cwd: process.cwd(),
            env: { ...process.env, GUARD_MODULE: moduleUrl, GUARD_ROOT: root },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        let stderr = '';
        child.stderr.setEncoding('utf-8');
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`child did not arm WorkspaceGuard: ${stderr}`));
        }, 5_000);
        child.stdout.once('data', () => child.kill('SIGTERM'));
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', (code, signal) => {
          clearTimeout(timeout);
          try {
            assert.equal(signal, null, stderr);
            assert.equal(code, 143, stderr);
            assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
            assert.equal(fs.existsSync(lockPath(root)), false);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores an unreadable mutated index before enumerating workspace rollback paths', () => {
    withRepo((root) => {
      const originalIndex = fs.readFileSync(path.join(root, '.git', 'index'));
      const guard = acquire(root);
      guard.beginStep(step(root, 'observe'));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'mutation beside corrupt index\n');
      fs.writeFileSync(path.join(root, '.git', 'index'), 'not a git index');

      const outcome = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(outcome.kind, 'error');
      if (outcome.kind === 'error') {
        assert.equal(outcome.error.code, 'VERIFY_WORKSPACE_CHECKPOINT_FAILED');
        assert.equal(outcome.restored, true);
      }
      assert.deepEqual(fs.readFileSync(path.join(root, '.git', 'index')), originalIndex);
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
      guard.release();
    });
  });

  it('fails restore before touching workspace or index when a checkpoint blob is corrupted', () => {
    withRepo((root) => {
      const guard = acquire(root);
      const checkpoint = checkpointOf(root);
      const entry = checkpoint.manifest.entries['tracked.txt'];
      assert.equal(entry.kind, 'file');
      assert.ok(entry.blob);
      const blobPath = path.join(checkpoint.directory, entry.blob);
      const originalBlob = fs.readFileSync(blobPath);
      guard.beginStep(step(root, 'observe'));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'must remain after failed restore\n');
      git(root, 'add', 'tracked.txt');
      const currentIndex = fs.readFileSync(path.join(root, '.git', 'index'));
      fs.writeFileSync(blobPath, 'corrupted checkpoint blob');

      const cancelled = guard.cancel('SIGTERM');
      assert.equal(cancelled.kind, 'error');
      if (cancelled.kind === 'error') {
        assert.equal(cancelled.error.code, 'VERIFY_WORKSPACE_RESTORE_FAILED');
      }
      assert.equal(
        fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'),
        'must remain after failed restore\n'
      );
      assert.deepEqual(fs.readFileSync(path.join(root, '.git', 'index')), currentIndex);
      assert.equal(fs.existsSync(lockPath(root)), true);
      assert.equal(fs.existsSync(checkpoint.directory), true);

      fs.writeFileSync(blobPath, originalBlob);
      assert.deepEqual(guard.cancel('SIGTERM'), { kind: 'cancelled', exitCode: 143 });
    });
  });

  it('fails restore before touching workspace or index when checkpoint index bytes are corrupted', () => {
    withRepo((root) => {
      const guard = acquire(root);
      const checkpoint = checkpointOf(root);
      const checkpointIndex = path.join(checkpoint.directory, 'index');
      const originalCheckpointIndex = fs.readFileSync(checkpointIndex);
      guard.beginStep(step(root, 'observe'));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'current worktree remains\n');
      git(root, 'add', 'tracked.txt');
      const currentIndex = fs.readFileSync(path.join(root, '.git', 'index'));
      fs.writeFileSync(checkpointIndex, 'corrupted checkpoint index');

      const cancelled = guard.cancel('SIGINT');
      assert.equal(cancelled.kind, 'error');
      if (cancelled.kind === 'error') {
        assert.equal(cancelled.error.code, 'VERIFY_WORKSPACE_RESTORE_FAILED');
      }
      assert.equal(
        fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'),
        'current worktree remains\n'
      );
      assert.deepEqual(fs.readFileSync(path.join(root, '.git', 'index')), currentIndex);
      assert.equal(fs.existsSync(lockPath(root)), true);
      assert.equal(fs.existsSync(checkpoint.directory), true);

      fs.writeFileSync(checkpointIndex, originalCheckpointIndex);
      assert.deepEqual(guard.cancel('SIGINT'), { kind: 'cancelled', exitCode: 130 });
    });
  });

  it('detects a branch commit and retains checkpoint without partial ref/index/worktree rollback', () => {
    withRepo((root) => {
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'preexisting staged intent\n');
      git(root, 'add', 'tracked.txt');
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'preexisting unstaged intent\n');
      const guard = acquire(root);
      const checkpoint = checkpointOf(root);
      guard.beginStep(step(root, 'observe'));
      git(root, 'commit', '-qm', 'forbidden command commit');
      const movedHead = git(root, 'rev-parse', 'HEAD');
      const currentIndex = fs.readFileSync(path.join(root, '.git', 'index'));

      const outcome = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(outcome.kind, 'error');
      if (outcome.kind === 'error') {
        assert.equal(outcome.error.code, 'VERIFY_WORKSPACE_REPOSITORY_MUTATION');
        assert.equal(outcome.restored, false);
        assert.match(outcome.error.message, /operator recovery/);
      }
      assert.deepEqual(
        outcome.mutations.map((mutation) => mutation.path),
        ['.git/HEAD', '.git/refs/heads/main']
      );
      assert.equal(git(root, 'rev-parse', 'HEAD'), movedHead);
      assert.equal(
        fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'),
        'preexisting unstaged intent\n'
      );
      assert.deepEqual(fs.readFileSync(path.join(root, '.git', 'index')), currentIndex);
      assert.equal(fs.existsSync(lockPath(root)), true);
      assert.equal(fs.existsSync(checkpoint.directory), true);
    });
  });

  it('detects detached HEAD drift without pretending it was restored', () => {
    withRepo((root) => {
      git(root, 'checkout', '--detach', '-q');
      const guard = acquire(root);
      guard.beginStep(step(root, 'observe'));
      git(root, 'commit', '--allow-empty', '-qm', 'detached drift');
      const movedHead = git(root, 'rev-parse', 'HEAD');

      const outcome = guard.finishStep('node:format-fix', { succeeded: true });
      assert.equal(outcome.kind, 'error');
      if (outcome.kind === 'error') {
        assert.equal(outcome.error.code, 'VERIFY_WORKSPACE_REPOSITORY_MUTATION');
        assert.equal(outcome.restored, false);
      }
      assert.deepEqual(
        outcome.mutations.map((mutation) => mutation.path),
        ['.git/HEAD']
      );
      assert.equal(git(root, 'rev-parse', 'HEAD'), movedHead);
      assert.equal(fs.existsSync(lockPath(root)), true);
    });
  });

  it('retains checkpoint and lock after a restore failure, then retries idempotently', () => {
    withRepo((root) => {
      const guard = acquire(root);
      guard.beginStep(step(root, 'observe'));
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'unexpected\n');
      fs.chmodSync(root, 0o500);
      try {
        const outcome = guard.finishStep('node:format-fix', { succeeded: true });
        assert.equal(outcome.kind, 'error');
        if (outcome.kind === 'error') {
          assert.equal(outcome.error.code, 'VERIFY_WORKSPACE_RESTORE_FAILED');
        }
        assert.equal(fs.existsSync(lockPath(root)), true);
      } finally {
        fs.chmodSync(root, 0o700);
      }

      assert.deepEqual(guard.cancel('SIGTERM'), { kind: 'cancelled', exitCode: 143 });
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
      assert.equal(fs.existsSync(lockPath(root)), false);
    });
  });

  it('fails closed while another target guard holds the worktree lock', () => {
    withRepo((root) => {
      const first = acquire(root);
      const second = acquireWorkspaceGuard(root, { signalHandlers: false });
      assert.equal(second.kind, 'error');
      if (second.kind === 'error') assert.equal(second.error.code, 'VERIFY_WORKSPACE_LOCKED');
      first.release();
    });
  });

  it('recovers a dead owner from its durable checkpoint before a new acquisition', () => {
    withRepo((root) => {
      acquire(root);
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'crashed repair debris\n');
      const payload = JSON.parse(fs.readFileSync(lockPath(root), 'utf-8')) as Record<
        string,
        unknown
      >;
      fs.writeFileSync(lockPath(root), JSON.stringify({ ...payload, pid: 999_999_999 }));

      const recovered = acquireWorkspaceGuard(root, { signalHandlers: false });
      assert.equal(
        recovered.kind,
        'guard',
        recovered.kind === 'error' ? recovered.error.message : undefined
      );
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'committed\n');
      if (recovered.kind === 'guard') recovered.guard.release();
    });
  });
});
