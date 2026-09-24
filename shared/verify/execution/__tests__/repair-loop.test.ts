// @file: Adversarial contracts for bounded repair and selective invalidation execution.
// @spec: CLI-VERIFY
// @consumers: CI

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { CapabilityMatrix } from '../../model/verify-readiness.type.ts';
import type { VerifyPlan } from '../../model/verify-report.type.ts';
import type { PlannedVerifyStep } from '../../model/verify-step.type.ts';
import { runLocalVerifyPlan } from '../repair-loop.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf-8',
  }).trim();
}

function createRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-loop-'));
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n');
  fs.writeFileSync(path.join(root, 'second.txt'), 'second baseline\n');
  fs.writeFileSync(path.join(root, 'dirty.txt'), 'committed\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'initial');
  return fs.realpathSync(root);
}

async function withRepo(run: (root: string, trace: string) => Promise<void>): Promise<void> {
  const root = createRepo();
  const trace = path.join(os.tmpdir(), `repair-loop-trace-${path.basename(root)}.txt`);
  try {
    await run(root, trace);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(trace, { force: true });
  }
}

function script(trace: string, marker: string, body = ''): string {
  return `require('node:fs').appendFileSync(${JSON.stringify(trace)}, ${JSON.stringify(marker)});${body}`;
}

function step(
  root: string,
  id: `${string}:${string}`,
  effect: PlannedVerifyStep['effect'],
  commandScript: string,
  overrides: Partial<PlannedVerifyStep> = {}
): PlannedVerifyStep {
  const plugin = id.slice(0, id.indexOf(':'));
  return {
    id,
    plugin,
    tags: ['code'],
    needs: [],
    executor: 'local',
    effect,
    command: {
      argv: [process.execPath, '-e', commandScript],
      cwd: root,
      timeoutMs: 2_000,
    },
    requires: [],
    ...(effect === 'repair'
      ? { writes: { root, include: ['tracked.txt', 'second.txt'], exclude: ['.git/**'] } }
      : {}),
    timeoutMs: 2_000,
    onFailure: 'stop-phase',
    ...overrides,
  };
}

function plan(steps: readonly PlannedVerifyStep[]): VerifyPlan {
  return { phase: 'code', steps };
}

const ready: CapabilityMatrix = { status: 'READY', entries: [] };

describe('target repair loop', () => {
  it('re-runs only invalidated successful observations and their qualified dependents', async () => {
    await withRepo(async (root, trace) => {
      fs.writeFileSync(path.join(root, 'dirty.txt'), 'agent dirty change\n');
      const observed = step(root, 'alpha:observe', 'observe', script(trace, 'A'));
      const dependent = step(root, 'beta:dependent', 'observe', script(trace, 'B'), {
        needs: ['alpha:observe'],
      });
      const repairBody = `const fs=require('node:fs');const file=${JSON.stringify(
        path.join(root, 'tracked.txt')
      )};if(fs.readFileSync(file,'utf8')==='baseline\\n')fs.writeFileSync(file,'fixed\\n');`;
      const repair = step(root, 'gamma:repair', 'repair', script(trace, 'R', repairBody), {
        needs: ['beta:dependent'],
        invalidates: ['alpha:observe'],
      });
      const unrelated = step(root, 'delta:unrelated', 'observe', script(trace, 'U'), {
        needs: ['gamma:repair'],
      });

      const result = await runLocalVerifyPlan(
        root,
        plan([observed, dependent, repair, unrelated]),
        ready,
        {
          signalHandlers: false,
        }
      );

      assert.equal(result.verdict, 'pass');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'ABRABRU');
      assert.deepEqual(
        result.results.map((entry) => entry.stepId),
        [
          'alpha:observe',
          'beta:dependent',
          'gamma:repair',
          'alpha:observe',
          'beta:dependent',
          'gamma:repair',
          'delta:unrelated',
        ]
      );
      assert.deepEqual(
        result.mutations.map((mutation) => [mutation.stepId, mutation.path]),
        [['gamma:repair', 'tracked.txt']]
      );
      assert.deepEqual(
        result.evidence
          .filter((entry) => entry.kind === 'command')
          .map((entry) => Number(/:attempt-(\d+)$/.exec(entry.identity)?.[1])),
        [1, 2, 3, 4, 5, 6, 7]
      );
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'fixed\n');
      assert.equal(fs.readFileSync(path.join(root, 'dirty.txt'), 'utf-8'), 'agent dirty change\n');
    });
  });

  it('bounds an unstable repair and reports non-convergence after every required recheck', async () => {
    await withRepo(async (root, trace) => {
      const observed = step(root, 'node:observe', 'observe', script(trace, 'O'));
      const toggle = `const fs=require('node:fs');const file=${JSON.stringify(
        path.join(root, 'tracked.txt')
      )};const value=fs.readFileSync(file,'utf8');fs.writeFileSync(file,value==='one\\n'?'two\\n':'one\\n');`;
      const repair = step(root, 'node:repair', 'repair', script(trace, 'R', toggle), {
        needs: ['node:observe'],
        invalidates: ['node:observe'],
      });

      const result = await runLocalVerifyPlan(root, plan([observed, repair]), ready, {
        signalHandlers: false,
      });

      assert.equal(result.verdict, 'violation');
      assert.equal(result.problem?.code, 'VERIFY_REPAIR_NON_CONVERGENT');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'ORORORO');
      assert.deepEqual(
        result.results.map((entry) => [entry.stepId, entry.status]),
        [
          ['node:observe', 'pass'],
          ['node:repair', 'pass'],
          ['node:observe', 'pass'],
          ['node:repair', 'pass'],
          ['node:observe', 'pass'],
          ['node:repair', 'violation'],
          ['node:observe', 'pass'],
        ]
      );
      assert.equal(result.mutations.length, 3);
      assert.ok(result.evidence.some((entry) => entry.identity.includes('non-convergent')));
    });
  });

  it('does not recheck after a no-op repair and handles multiple repair nodes independently', async () => {
    await withRepo(async (root, trace) => {
      const observed = step(root, 'node:observe', 'observe', script(trace, 'O'));
      const noOp = step(root, 'node:noop-fix', 'repair', script(trace, 'N'), {
        needs: ['node:observe'],
        invalidates: ['node:observe'],
      });
      const mutate = `const fs=require('node:fs');const file=${JSON.stringify(
        path.join(root, 'second.txt')
      )};if(fs.readFileSync(file,'utf8')==='second baseline\\n')fs.writeFileSync(file,'second fixed\\n');`;
      const mutating = step(root, 'node:format-fix', 'repair', script(trace, 'M', mutate), {
        needs: ['node:noop-fix'],
        invalidates: ['node:observe'],
      });

      const result = await runLocalVerifyPlan(root, plan([observed, noOp, mutating]), ready, {
        signalHandlers: false,
      });

      assert.equal(result.verdict, 'pass');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'ONMOM');
      assert.equal(result.results.filter((entry) => entry.stepId === 'node:noop-fix').length, 1);
      assert.equal(result.results.filter((entry) => entry.stepId === 'node:format-fix').length, 2);
    });
  });

  it('restores a failed repair and propagates block and waiver without spawning dependents', async () => {
    await withRepo(async (root, trace) => {
      const partialWrite = `require('node:fs').writeFileSync(${JSON.stringify(
        path.join(root, 'tracked.txt')
      )},'partial\\n');process.exit(7);`;
      const failedRepair = step(root, 'node:repair', 'repair', script(trace, 'R', partialWrite));
      const afterFailure = step(root, 'node:after', 'observe', script(trace, 'A'), {
        needs: ['node:repair'],
      });
      const failed = await runLocalVerifyPlan(root, plan([failedRepair, afterFailure]), ready, {
        signalHandlers: false,
      });
      assert.equal(failed.verdict, 'fail');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'R');
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'baseline\n');
      assert.deepEqual(
        failed.results.map((entry) => entry.stepId),
        ['node:repair']
      );

      fs.rmSync(trace, { force: true });
      const required = step(root, 'node:required', 'observe', script(trace, 'B'), {
        requires: [
          {
            id: 'node:tool',
            kind: 'command',
            description: 'tool exists',
            required: true,
            fix: 'install tool',
          },
        ],
      });
      const blocked = await runLocalVerifyPlan(
        root,
        plan([required]),
        {
          status: 'BLOCKED',
          entries: [
            {
              plugin: 'node',
              phase: 'code',
              requirementId: 'node:tool',
              stepId: 'node:required',
              status: 'BLOCKED',
              message: 'tool missing',
              fix: 'install tool',
            },
          ],
        },
        { signalHandlers: false }
      );
      assert.equal(blocked.verdict, 'blocked');
      assert.equal(fs.existsSync(trace), false);

      const waivedStep = step(root, 'node:waived', 'repair', script(trace, 'W'));
      const afterWaiver = step(root, 'node:after-waiver', 'observe', script(trace, 'A'), {
        needs: ['node:waived'],
      });
      const waived = await runLocalVerifyPlan(
        root,
        plan([waivedStep, afterWaiver]),
        {
          status: 'DEGRADED',
          entries: [
            {
              plugin: 'node',
              phase: 'code',
              requirementId: 'waiver:node:waived',
              stepId: 'node:waived',
              disposition: 'waived',
              status: 'WAIVED',
              message: 'disabled by project policy',
              blocking: false,
              policyReason: 'external formatter owns this step',
              policySource: 'gennady.yaml',
            },
          ],
        },
        { signalHandlers: false }
      );
      assert.equal(waived.verdict, 'pass');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'A');
      assert.deepEqual(
        waived.results.map((entry) => entry.status),
        ['waived', 'pass']
      );
    });
  });

  it('restores timed-out and cancelled repairs and stops the remaining plan', async () => {
    await withRepo(async (root, trace) => {
      const writeThenWait = `require('node:fs').writeFileSync(${JSON.stringify(
        path.join(root, 'tracked.txt')
      )},'temporary\\n');setInterval(()=>{},1000);`;
      const timed = step(root, 'node:timed', 'repair', script(trace, 'T', writeThenWait), {
        command: {
          argv: [process.execPath, '-e', script(trace, 'T', writeThenWait)],
          cwd: root,
          timeoutMs: 80,
        },
        timeoutMs: 80,
      });
      const timedResult = await runLocalVerifyPlan(root, plan([timed]), ready, {
        signalHandlers: false,
      });
      assert.equal(timedResult.verdict, 'timeout');
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'baseline\n');

      fs.rmSync(trace, { force: true });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 80);
      const cancelled = await runLocalVerifyPlan(root, plan([timed]), ready, {
        signal: controller.signal,
        cancellationSignal: 'SIGTERM',
        signalHandlers: false,
      });
      assert.equal(cancelled.verdict, 'cancelled');
      assert.deepEqual(cancelled.cancellation, { signal: 'SIGTERM', exitCode: 143 });
      assert.equal(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf-8'), 'baseline\n');
    });
  });

  it('applies block-dependents and continue policies without hiding the original failure', async () => {
    await withRepo(async (root, trace) => {
      const failed = step(root, 'alpha:failed', 'observe', 'process.exit(7)', {
        onFailure: 'block-dependents',
      });
      const dependent = step(root, 'alpha:dependent', 'observe', script(trace, 'D'), {
        needs: ['alpha:failed'],
      });
      const independent = step(root, 'beta:independent', 'observe', script(trace, 'I'));
      const blockedPath = await runLocalVerifyPlan(
        root,
        plan([failed, dependent, independent]),
        ready,
        { signalHandlers: false }
      );
      assert.equal(blockedPath.verdict, 'fail');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'I');
      assert.deepEqual(
        blockedPath.results.map((entry) => [entry.stepId, entry.status]),
        [
          ['alpha:failed', 'fail'],
          ['alpha:dependent', 'skipped'],
          ['beta:independent', 'pass'],
        ]
      );

      fs.rmSync(trace, { force: true });
      const continued = step(root, 'alpha:continued', 'observe', 'process.exit(9)', {
        onFailure: 'continue',
      });
      const after = step(root, 'alpha:after', 'observe', script(trace, 'A'), {
        needs: ['alpha:continued'],
      });
      const continuedPath = await runLocalVerifyPlan(root, plan([continued, after]), ready, {
        signalHandlers: false,
      });
      assert.equal(continuedPath.verdict, 'fail');
      assert.equal(fs.readFileSync(trace, 'utf-8'), 'A');
      assert.deepEqual(
        continuedPath.results.map((entry) => entry.status),
        ['fail', 'pass']
      );
    });
  });
});
