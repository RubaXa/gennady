// @file: Remote Verify executor terminal mapping and shared-session tests.
// @spec: CLI-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CapabilityMatrix } from '../../model/verify-readiness.type.ts';
import type { PlannedVerifyStep } from '../../model/verify-step.type.ts';
import { executeRemoteStep, type RemoteVerifySession } from '../remote.executor.ts';
import type { RemotePipelineState, RemoteWatchResult } from '../remote-watcher.ts';

const SHA = 'a'.repeat(40);
const READY: CapabilityMatrix = { status: 'READY', entries: [] };

function step(plugin = 'node'): PlannedVerifyStep {
  return {
    id: `${plugin}:remote-ci`,
    plugin,
    tags: ['remote-ci'],
    needs: [],
    executor: 'vcs-pipeline',
    effect: 'remote-watch',
    requires: [],
    timeoutMs: 1_000,
    onFailure: 'stop-phase',
  };
}

function watched(state: RemotePipelineState): RemoteWatchResult {
  return {
    state,
    evidence: [{ kind: 'remote-pipeline', identity: 'remote:77', summary: state }],
    message: state,
  };
}

function session(result: RemoteWatchResult, calls: { value: number }): RemoteVerifySession {
  return {
    observer: {
      provider: 'gitlab',
      project: 'group/repo',
      pipeline: {
        async hasCommit() {
          throw new Error('injected watch owns provider calls');
        },
        async findPipelinesBySha() {
          throw new Error('injected watch owns provider calls');
        },
        async getPipeline() {
          throw new Error('injected watch owns provider calls');
        },
        async getPipelineJobs() {
          throw new Error('injected watch owns provider calls');
        },
        async getJobLog() {
          throw new Error('injected watch owns provider calls');
        },
      },
    },
    sourceSha: SHA,
    watch: async () => {
      calls.value += 1;
      return result;
    },
  };
}

describe('executeRemoteStep', () => {
  it('maps every remote outcome without treating manual, skipped or canceled as pass', async () => {
    for (const [state, status, verdict] of [
      ['REMOTE_SUCCESS', 'pass', 'pass'],
      ['REMOTE_FAILED', 'fail', 'fail'],
      ['REMOTE_CANCELED', 'fail', 'fail'],
      ['REMOTE_MANUAL', 'fail', 'fail'],
      ['REMOTE_SKIPPED', 'fail', 'fail'],
      ['REMOTE_TIMED_OUT', 'timeout', 'timeout'],
      ['REMOTE_UNAVAILABLE', 'env-fail', 'env-fail'],
      ['REMOTE_UNAUTHORIZED', 'env-fail', 'env-fail'],
      ['REMOTE_RATE_LIMITED', 'env-fail', 'env-fail'],
      ['REMOTE_SHA_MISMATCH', 'violation', 'violation'],
      ['REMOTE_PIPELINE_AMBIGUOUS', 'violation', 'violation'],
      ['REMOTE_CANCELLED', 'cancelled', 'cancelled'],
    ] as const) {
      const result = await executeRemoteStep(step(), session(watched(state), { value: 0 }), READY);
      assert.equal(result.result?.status, status, state);
      assert.equal(result.verdict, verdict, state);
    }
  });

  it('shares one observation across affected plugins and projects evidence only once', async () => {
    const calls = { value: 0 };
    const shared = session(watched('REMOTE_SUCCESS'), calls);
    const first = await executeRemoteStep(step('node'), shared, READY);
    const second = await executeRemoteStep(step('golang'), shared, READY);
    assert.equal(calls.value, 1);
    assert.equal(first.evidence.length, 1);
    assert.equal(second.evidence.length, 0);
    assert.equal(first.result?.status, 'pass');
    assert.equal(second.result?.status, 'pass');
  });
});
