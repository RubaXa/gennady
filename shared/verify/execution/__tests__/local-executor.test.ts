// @file: Adversarial contracts for direct-argv target local execution.
// @spec: CLI-VERIFY
// @consumers: CI

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { CapabilityMatrix } from '../../model/verify-readiness.type.ts';
import type { PlannedVerifyStep } from '../../model/verify-step.type.ts';
import { executeLocalStep } from '../local.executor.ts';
import { acquireWorkspaceGuard } from '../workspace-guard.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf-8',
  }).trim();
}

function createRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-executor-'));
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'initial');
  return fs.realpathSync(root);
}

async function withRepo(run: (root: string) => Promise<void>): Promise<void> {
  const root = createRepo();
  try {
    await run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function step(
  root: string,
  script: string,
  overrides: Partial<PlannedVerifyStep> = {}
): PlannedVerifyStep {
  return {
    id: 'node:unit',
    plugin: 'node',
    tags: ['unit'],
    needs: [],
    executor: 'local',
    effect: 'observe',
    command: {
      argv: [process.execPath, '-e', script],
      cwd: root,
      timeoutMs: 2_000,
    },
    requires: [],
    timeoutMs: 2_000,
    onFailure: 'stop-phase',
    ...overrides,
  };
}

function acquire(root: string) {
  const acquired = acquireWorkspaceGuard(root, { signalHandlers: false });
  assert.equal(
    acquired.kind,
    'guard',
    acquired.kind === 'error' ? acquired.error.message : undefined
  );
  if (acquired.kind !== 'guard') throw acquired.error;
  return acquired.guard;
}

describe('target local executor', () => {
  it('executes direct argv, merges explicit environment, and distinguishes exit zero/nonzero', async () => {
    await withRepo(async (root) => {
      const guard = acquire(root);
      const passingScript =
        "if (process.env.UV09_VALUE !== 'child') process.exit(9); process.stdout.write('successful secret-like output')";
      const passing = step(root, passingScript, {
        command: {
          argv: [process.execPath, '-e', passingScript],
          cwd: root,
          env: { UV09_VALUE: 'child' },
          timeoutMs: 2_000,
        },
      });
      const passed = await executeLocalStep(passing, guard);
      assert.equal(passed.verdict, 'pass');
      assert.equal(passed.result?.status, 'pass');
      assert.equal(passed.result?.exitCode, 0);
      assert.ok(passed.evidence.some((item) => item.summary.includes('status pass')));
      assert.ok(!passed.evidence.some((item) => item.identity.endsWith(':stdout')));
      assert.ok(!passed.evidence.some((item) => item.summary.includes('secret-like')));

      const failed = await executeLocalStep(step(root, 'process.exit(7)'), guard);
      assert.equal(failed.verdict, 'fail');
      assert.equal(failed.result?.status, 'fail');
      assert.equal(failed.result?.exitCode, 7);
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('classifies output failures and serializable environment predicates with provenance', async () => {
    await withRepo(async (root) => {
      const guard = acquire(root);
      const outputFailure = await executeLocalStep(
        step(root, "process.stdout.write('needs formatting\\n')", { outputMeansFailure: true }),
        guard
      );
      assert.equal(outputFailure.verdict, 'fail');
      assert.equal(outputFailure.result?.status, 'fail');

      const environment = await executeLocalStep(
        step(
          root,
          "process.stderr.write('x'.repeat(512) + 'toolchain unavailable\\n'); process.exit(7)",
          {
            envFail: [
              {
                exitCodeMatches: '==7',
                stderrMatches: 'toolchain unavailable',
                hint: 'install the pinned toolchain',
                source: 'builtin:test',
              },
            ],
          }
        ),
        guard,
        { maxEvidenceBytes: 128 }
      );
      assert.equal(environment.verdict, 'env-fail');
      assert.equal(environment.result?.status, 'env-fail');
      assert.equal(environment.problem?.source, 'builtin:test');
      assert.match(environment.result?.output ?? '', /install the pinned toolchain/);
      assert.ok(environment.evidence.some((item) => item.summary.includes('builtin:test')));

      const product = await executeLocalStep(
        step(root, "process.stderr.write('assertion failed\\n'); process.exit(7)", {
          envFail: [
            {
              stderrMatches: 'toolchain unavailable',
              hint: 'install the pinned toolchain',
              source: 'builtin:test',
            },
          ],
        }),
        guard
      );
      assert.equal(product.verdict, 'fail');
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('blocks missing readiness or command and classifies a missing binary as environment failure', async () => {
    await withRepo(async (root) => {
      const guard = acquire(root);
      const requirement = {
        id: 'node:script:unit',
        kind: 'script' as const,
        description: 'unit script exists',
        required: true,
        fix: 'add the unit script',
      };
      const required = step(root, 'process.exit(0)', { requires: [requirement] });
      const missingReadiness = await executeLocalStep(required, guard);
      assert.equal(missingReadiness.verdict, 'blocked');
      assert.equal(missingReadiness.result, null);
      assert.equal(missingReadiness.problem?.code, 'VERIFY_LOCAL_READINESS_BLOCKED');

      const blockedMatrix: CapabilityMatrix = {
        status: 'BLOCKED',
        entries: [
          {
            plugin: 'node',
            phase: 'unit',
            requirementId: requirement.id,
            stepId: required.id,
            status: 'BLOCKED',
            message: 'unit script missing',
            fix: requirement.fix,
            blocking: true,
          },
        ],
      };
      const blocked = await executeLocalStep(required, guard, { readiness: blockedMatrix });
      assert.equal(blocked.verdict, 'blocked');
      assert.match(blocked.problem?.message ?? '', /unit script missing/);

      const repeatedRequirement: CapabilityMatrix = {
        status: 'BLOCKED',
        entries: [
          {
            plugin: 'node',
            phase: 'unit',
            requirementId: requirement.id,
            stepId: 'node:other',
            status: 'READY',
            message: 'other step is ready',
          },
          {
            plugin: 'node',
            phase: 'unit',
            requirementId: requirement.id,
            stepId: required.id,
            status: 'BLOCKED',
            message: 'target step is blocked',
            fix: requirement.fix,
          },
        ],
      };
      const exactBlocked = await executeLocalStep(required, guard, {
        readiness: repeatedRequirement,
      });
      assert.equal(exactBlocked.verdict, 'blocked');
      assert.match(exactBlocked.problem?.message ?? '', /target step is blocked/);

      const pluginWideBlocked = await executeLocalStep(step(root, 'process.exit(0)'), guard, {
        readiness: {
          status: 'BLOCKED',
          entries: [
            {
              plugin: 'node',
              phase: 'unit',
              requirementId: 'node:package-json',
              status: 'BLOCKED',
              message: 'package.json is invalid',
            },
            {
              plugin: 'golang',
              phase: 'unit',
              requirementId: 'golang:go-mod',
              status: 'BLOCKED',
              message: 'unrelated Go readiness is blocked',
            },
          ],
        },
      });
      assert.equal(pluginWideBlocked.verdict, 'blocked');
      assert.match(pluginWideBlocked.problem?.message ?? '', /package\.json is invalid/);

      const unrelatedPluginBlock = await executeLocalStep(step(root, 'process.exit(0)'), guard, {
        readiness: {
          status: 'BLOCKED',
          entries: [
            {
              plugin: 'golang',
              phase: 'unit',
              requirementId: 'golang:go-mod',
              status: 'BLOCKED',
              message: 'unrelated Go readiness is blocked',
            },
          ],
        },
      });
      assert.equal(unrelatedPluginBlock.verdict, 'pass');

      const commandless = { ...step(root, ''), command: undefined };
      const absent = await executeLocalStep(commandless, guard);
      assert.equal(absent.verdict, 'blocked');
      assert.equal(absent.result, null);
      assert.equal(absent.problem?.code, 'VERIFY_LOCAL_COMMAND_MISSING');

      const unboundedRequest = await executeLocalStep(step(root, 'process.exit(0)'), guard, {
        maxPolicyOutputBytes: 2 * 1024 * 1024,
      });
      assert.equal(unboundedRequest.verdict, 'blocked');
      assert.equal(unboundedRequest.problem?.code, 'VERIFY_LOCAL_COMMAND_INVALID');

      const missingBinary = step(root, '', {
        command: {
          argv: [path.join(root, 'definitely-missing-binary')],
          cwd: root,
          timeoutMs: 2_000,
        },
      });
      const spawnFailure = await executeLocalStep(missingBinary, guard);
      assert.equal(spawnFailure.verdict, 'env-fail');
      assert.equal(spawnFailure.result?.status, 'env-fail');
      assert.equal(spawnFailure.problem?.code, 'VERIFY_LOCAL_SPAWN_FAILED');

      const synchronousSpawnFailure = await executeLocalStep(
        step(root, '', {
          command: { argv: ['invalid\0binary'], cwd: root, timeoutMs: 2_000 },
        }),
        guard
      );
      assert.equal(synchronousSpawnFailure.verdict, 'env-fail');
      assert.equal(synchronousSpawnFailure.problem?.code, 'VERIFY_LOCAL_SPAWN_FAILED');
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('does not spawn explicitly waived or non-runnable selected nodes', async () => {
    await withRepo(async (root) => {
      const sentinel = path.join(root, 'must-not-run-disposition.txt');
      const runnable = step(
        root,
        `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'spawned')`
      );
      const guard = acquire(root);
      const waivedMatrix: CapabilityMatrix = {
        status: 'DEGRADED',
        entries: [
          {
            plugin: 'node',
            phase: 'unit',
            requirementId: 'node:waiver:unit',
            stepId: runnable.id,
            disposition: 'waived',
            status: 'WAIVED',
            message: 'disabled by project policy',
            blocking: false,
            policyReason: 'covered by an external contract',
            policySource: '/repo/gennady.yaml',
          },
        ],
      };
      const waived = await executeLocalStep(runnable, guard, { readiness: waivedMatrix });
      assert.equal(waived.verdict, 'waived');
      assert.equal(waived.result?.status, 'waived');
      assert.match(waived.evidence[0]?.summary ?? '', /external contract/);
      assert.match(waived.evidence[0]?.summary ?? '', /gennady\.yaml/);
      assert.equal(fs.existsSync(sentinel), false);

      for (const [disposition, status] of [
        ['not-applicable', 'READY'],
        ['optional-unavailable', 'DEGRADED'],
      ] as const) {
        const commandless = { ...runnable, command: undefined };
        const skippedResult = await executeLocalStep(commandless, guard, {
          readiness: {
            status,
            entries: [
              {
                plugin: 'node',
                phase: 'unit',
                requirementId: `node:${disposition}`,
                stepId: runnable.id,
                disposition,
                status,
                message: disposition,
              },
            ],
          },
        });
        assert.equal(skippedResult.verdict, 'skipped');
        assert.equal(skippedResult.result?.status, 'skipped');
      }
      assert.equal(fs.existsSync(sentinel), false);
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('rejects cwd escape and symlink traversal before spawning', async () => {
    await withRepo(async (root) => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'local-executor-outside-'));
      try {
        fs.symlinkSync(outside, path.join(root, 'linked'));
        const guard = acquire(root);
        for (const cwd of [outside, path.join(root, 'linked')]) {
          const unsafe = await executeLocalStep(
            step(root, 'process.exit(0)', {
              command: {
                argv: [process.execPath, '-e', 'process.exit(0)'],
                cwd,
                timeoutMs: 2_000,
              },
            }),
            guard
          );
          assert.equal(unsafe.verdict, 'violation');
          assert.equal(unsafe.result?.status, 'violation');
          assert.equal(unsafe.problem?.code, 'VERIFY_LOCAL_CWD_UNSAFE');
        }
        assert.deepEqual(guard.release(), { kind: 'released' });
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it('times out and terminates the descendant process tree without an orphan', async () => {
    await withRepo(async (root) => {
      const sentinel = path.join(root, 'descendant-finished.txt');
      const childScript = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'orphan'), 600)`;
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        `spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
        'setInterval(() => {}, 1000);',
      ].join('\n');
      const guard = acquire(root);
      const timedOut = await executeLocalStep(
        step(root, parentScript, {
          command: {
            argv: [process.execPath, '-e', parentScript],
            cwd: root,
            timeoutMs: 100,
          },
          timeoutMs: 100,
        }),
        guard
      );
      assert.equal(timedOut.verdict, 'timeout');
      assert.equal(timedOut.result?.status, 'timeout');
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(fs.existsSync(sentinel), false);
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('bounds stdout/stderr evidence by UTF-8 bytes with deterministic truncation', async () => {
    await withRepo(async (root) => {
      const run = async () => {
        const guard = acquire(root);
        const result = await executeLocalStep(
          step(
            root,
            "process.stdout.write('🙂'.repeat(300)); process.stderr.write('é'.repeat(300)); process.exit(2)"
          ),
          guard,
          { maxEvidenceBytes: 256 }
        );
        assert.deepEqual(guard.release(), { kind: 'released' });
        return result;
      };
      const first = await run();
      const second = await run();
      const logs = (result: typeof first) =>
        result.evidence.filter((item) => item.kind === 'log').map((item) => item.summary);
      assert.deepEqual(logs(first), logs(second));
      assert.ok(logs(first).every((summary) => Buffer.byteLength(summary) <= 256));
      assert.ok(logs(first).every((summary) => summary.includes('[truncated ')));
      assert.ok(!logs(first).some((summary) => summary.includes('�')));
      assert.ok(Buffer.byteLength(first.result?.output ?? '') <= 256);
    });
  });

  it('drains verbose output without a regex policy and preserves exit-only classification', async () => {
    await withRepo(async (root) => {
      const loud = "process.stdout.write('x'.repeat(8192))";
      const guard = acquire(root);
      const passed = await executeLocalStep(step(root, loud), guard, {
        maxEvidenceBytes: 128,
        maxPolicyOutputBytes: 512,
      });
      assert.equal(passed.verdict, 'pass');
      assert.ok(!passed.evidence.some((item) => item.identity.endsWith(':stdout')));

      const outputFailure = await executeLocalStep(
        step(root, loud, { outputMeansFailure: true }),
        guard,
        { maxEvidenceBytes: 128, maxPolicyOutputBytes: 512 }
      );
      assert.equal(outputFailure.verdict, 'fail');
      assert.notEqual(outputFailure.problem?.code, 'VERIFY_LOCAL_OUTPUT_LIMIT');

      const exitOnly = await executeLocalStep(
        step(root, `${loud}; process.exit(7)`, {
          envFail: [{ exitCodeMatches: 7, hint: 'restore the external test service' }],
        }),
        guard,
        { maxEvidenceBytes: 128, maxPolicyOutputBytes: 512 }
      );
      assert.equal(exitOnly.verdict, 'env-fail');
      assert.equal(exitOnly.problem?.code, 'VERIFY_LOCAL_ENVIRONMENT_FAILURE');
      assert.ok(
        exitOnly.evidence
          .filter((item) => item.kind === 'log')
          .every((item) => Buffer.byteLength(item.summary) <= 128)
      );
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('does not false-fail successful verbose regex-policy output and fails closed only when needed', async () => {
    await withRepo(async (root) => {
      const guard = acquire(root);
      const verboseSuccess = await executeLocalStep(
        step(root, "process.stdout.write('x'.repeat(8192)); process.exit(0)", {
          envFail: [{ outputMatches: 'never matches', hint: 'repair output classifier' }],
        }),
        guard,
        {
          maxEvidenceBytes: 256,
          maxPolicyOutputBytes: 2_048,
        }
      );
      assert.equal(verboseSuccess.verdict, 'pass');
      assert.equal(verboseSuccess.result?.status, 'pass');
      assert.ok(!verboseSuccess.evidence.some((item) => item.identity.endsWith(':stdout')));

      const unclassifiableFailure = await executeLocalStep(
        step(root, "process.stdout.write('x'.repeat(8192)); process.exit(7)", {
          envFail: [{ outputMatches: 'never matches', hint: 'repair output classifier' }],
        }),
        guard,
        {
          maxEvidenceBytes: 256,
          maxPolicyOutputBytes: 2_048,
        }
      );
      assert.equal(unclassifiableFailure.verdict, 'violation');
      assert.equal(unclassifiableFailure.result?.status, 'violation');
      assert.equal(unclassifiableFailure.problem?.code, 'VERIFY_LOCAL_OUTPUT_LIMIT');
      assert.ok(
        unclassifiableFailure.evidence
          .filter((item) => item.kind === 'log')
          .every((item) => Buffer.byteLength(item.summary) <= 256)
      );
      assert.ok(Buffer.byteLength(unclassifiableFailure.result?.output ?? '') <= 256);

      const sufficientPrefix = await executeLocalStep(
        step(
          root,
          "process.stdout.write('device unavailable\\n' + 'x'.repeat(8192)); process.exit(7)",
          {
            envFail: [{ stdoutMatches: 'device unavailable', hint: 'restore simulator runtime' }],
          }
        ),
        guard,
        {
          maxEvidenceBytes: 256,
          maxPolicyOutputBytes: 2_048,
        }
      );
      assert.equal(sufficientPrefix.verdict, 'env-fail');
      assert.equal(sufficientPrefix.problem?.code, 'VERIFY_LOCAL_ENVIRONMENT_FAILURE');
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('keeps a successful bounded repair and restores a failed partial repair', async () => {
    await withRepo(async (root) => {
      const target = path.join(root, 'tracked.txt');
      const repair = (content: string, exitCode: number) =>
        step(
          root,
          `require('node:fs').writeFileSync(${JSON.stringify(target)}, ${JSON.stringify(content)}); process.exit(${exitCode})`,
          {
            id: 'node:format-fix',
            effect: 'repair',
            writes: { root, include: ['tracked.txt'] },
          }
        );
      const guard = acquire(root);
      const success = await executeLocalStep(repair('fixed\n', 0), guard);
      assert.equal(success.verdict, 'pass');
      assert.deepEqual(
        success.mutations.map((item) => [item.path, item.allowed]),
        [['tracked.txt', true]]
      );
      assert.equal(fs.readFileSync(target, 'utf-8'), 'fixed\n');

      const failure = await executeLocalStep(repair('partial\n', 5), guard);
      assert.equal(failure.verdict, 'fail');
      assert.equal(fs.readFileSync(target, 'utf-8'), 'fixed\n');
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('bounds every evidence summary while retaining the complete mutation model', async () => {
    await withRepo(async (root) => {
      const directory = path.join(root, 'generated');
      const script = [
        `const fs = require('node:fs'); const dir = ${JSON.stringify(directory)};`,
        'fs.mkdirSync(dir);',
        "for (let index = 0; index < 20; index += 1) fs.writeFileSync(require('node:path').join(dir, `artifact-${String(index).padStart(2, '0')}-${'x'.repeat(64)}.txt`), 'ok');",
      ].join('\n');
      const guard = acquire(root);
      const result = await executeLocalStep(
        step(root, script, {
          id: 'node:generate',
          effect: 'repair',
          writes: { root, include: ['generated/**'], exclude: ['.git/**'] },
        }),
        guard,
        { maxEvidenceBytes: 128 }
      );
      assert.equal(result.verdict, 'pass');
      assert.equal(result.mutations.length, 20);
      assert.ok(result.evidence.every((item) => Buffer.byteLength(item.summary) <= 128));
      const diff = result.evidence.find((item) => item.kind === 'diff');
      assert.match(diff?.summary ?? '', /\[truncated \d+ byte\(s\)\]/);
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('lets WorkspaceGuard violation dominate an observing exit zero', async () => {
    await withRepo(async (root) => {
      const target = path.join(root, 'tracked.txt');
      const guard = acquire(root);
      const result = await executeLocalStep(
        step(root, `require('node:fs').writeFileSync(${JSON.stringify(target)}, 'unexpected\\n')`),
        guard
      );
      assert.equal(result.verdict, 'violation');
      assert.equal(result.result?.status, 'violation');
      assert.equal(result.problem?.code, 'VERIFY_WORKSPACE_WRITE_VIOLATION');
      assert.equal(fs.readFileSync(target, 'utf-8'), 'baseline\n');
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('maps ref mutation fail-closed without automatic ref rollback', async () => {
    await withRepo(async (root) => {
      const before = git(root, 'rev-parse', 'HEAD');
      const guard = acquire(root);
      const result = await executeLocalStep(
        step(root, '', {
          command: {
            argv: [
              'git',
              '-c',
              'user.email=t@t',
              '-c',
              'user.name=t',
              'commit',
              '--allow-empty',
              '-m',
              'forbidden ref mutation',
            ],
            cwd: root,
            timeoutMs: 2_000,
          },
        }),
        guard
      );
      assert.equal(result.verdict, 'violation');
      assert.equal(result.problem?.code, 'VERIFY_WORKSPACE_REPOSITORY_MUTATION');
      assert.notEqual(git(root, 'rev-parse', 'HEAD'), before);

      git(root, 'update-ref', 'refs/heads/main', before);
      assert.deepEqual(guard.release(), { kind: 'released' });
    });
  });

  it('hands AbortSignal cancellation to WorkspaceGuard restoration with signal identity', async () => {
    await withRepo(async (root) => {
      const target = path.join(root, 'tracked.txt');
      const script = [
        `require('node:fs').writeFileSync(${JSON.stringify(target)}, 'partial\\n');`,
        'setInterval(() => {}, 1000);',
      ].join('\n');
      const controller = new AbortController();
      const guard = acquire(root);
      const running = executeLocalStep(step(root, script), guard, {
        signal: controller.signal,
        cancellationSignal: 'SIGTERM',
      });
      setTimeout(() => controller.abort(), 100);
      const result = await running;
      assert.equal(result.verdict, 'cancelled');
      assert.equal(result.result?.status, 'cancelled');
      assert.deepEqual(result.cancellation, { signal: 'SIGTERM', exitCode: 143 });
      assert.equal(fs.readFileSync(target, 'utf-8'), 'baseline\n');
      assert.equal(fs.existsSync(path.join(root, '.git', 'gennady-workspace-guard.lock')), false);
    });
  });

  it('does not spawn an already-cancelled step and releases the guarded checkpoint', async () => {
    await withRepo(async (root) => {
      const sentinel = path.join(root, 'must-not-run.txt');
      const controller = new AbortController();
      controller.abort();
      const guard = acquire(root);
      const result = await executeLocalStep(
        step(root, `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'spawned\\n')`),
        guard,
        { signal: controller.signal }
      );
      assert.equal(result.verdict, 'cancelled');
      assert.deepEqual(result.cancellation, { signal: 'SIGINT', exitCode: 130 });
      assert.equal(fs.existsSync(sentinel), false);
      assert.equal(fs.existsSync(path.join(root, '.git', 'gennady-workspace-guard.lock')), false);
    });
  });
});
