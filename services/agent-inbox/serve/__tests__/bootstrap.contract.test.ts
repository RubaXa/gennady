// @file: Bootstrap contract test — journal-first composition exposes PipelineRuntime chain; no legacy role scheduler.
// @consumers: node:test runner
// @tasks: TSK-181

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type BootstrapResult } from '../bootstrap.ts';
import { PipelineRuntime } from '../../modules/inbox-pipeline/pipeline-runtime.ts';
import { gracefulShutdown } from '../shutdown.ts';

describe('bootstrap.contract — journal-first composition [contract]', () => {
  let result: BootstrapResult;

  before(async () => {
    result = await bootstrap({ mocks: true, port: 0 });
  });

  after(async () => {
    await gracefulShutdown({
      server: result.server,
      scheduler: result.scheduler,
      opencode: result.opencode,
      opencodeProcess: result.opencodeProcess,
      opencodePidFile: result.opencodePidFile,
    });
    clearInterval(result.lifecycleReaper);
  });

  it('production composition exposes one journal first runtime chain', async () => {
    // invariant: after TSK-181 migration, PipelineRuntime is the single review execution owner
    // non-goal: pipeline DAG internals — only the composition surface is asserted
    // contract: roles=[], scheduler=NoOpScheduler shim, pipeline=PipelineRuntime, vcsTruth=null in mock mode

    // #region START_CHAIN_ASSERT_PIPELINE
    assert.ok(
      result.pipeline instanceof PipelineRuntime,
      'pipeline must be a PipelineRuntime instance'
    );
    // #endregion END_CHAIN_ASSERT_PIPELINE

    // #region START_CHAIN_ASSERT_NO_LEGACY_SCHEDULER
    assert.deepStrictEqual(result.roles, [], 'roles must be empty after journal-first migration');
    // scheduler is the NoOpScheduler shim — tick/stop/advanceInstances/assignManual
    assert.strictEqual(typeof result.scheduler.tick, 'function', 'scheduler.tick must exist');
    assert.strictEqual(typeof result.scheduler.stop, 'function', 'scheduler.stop must exist');
    assert.strictEqual(
      typeof result.scheduler.advanceInstances,
      'function',
      'scheduler.advanceInstances must exist'
    );
    assert.strictEqual(
      typeof result.scheduler.assignManual,
      'function',
      'scheduler.assignManual must exist'
    );
    assert.strictEqual(
      'loadAll' in result.scheduler,
      false,
      'scheduler must not expose RoleEngine#loadAll — legacy role engine must be absent'
    );
    // #endregion END_CHAIN_ASSERT_NO_LEGACY_SCHEDULER

    // #region START_CHAIN_ASSERT_NO_DUPLICATE_VCS
    // in mock mode, vcsTruth is null — no duplicate VCS truth layer
    assert.strictEqual(
      result.vcsTruth,
      null,
      'vcsTruth must be null in mock mode (no duplicate truth layer)'
    );
    // #endregion END_CHAIN_ASSERT_NO_DUPLICATE_VCS

    // NoOpScheduler backward-compat surface: all lifecycle methods resolve without throwing
    await result.scheduler.tick();
    await result.scheduler.advanceInstances();
    await result.scheduler.assignManual('mr-id', 'reviewer', {});
  });
});

// Multi-server suites accumulate native libuv handles; guard keeps runner from hanging after last assertion.
setTimeout(() => process.exit(0), 60_000).unref();
