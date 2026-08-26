// @file: Bootstrap integration test — boot phase sequence observable before mutation readiness.
// @consumers: node:test runner
// @tasks: TSK-181

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BootState } from '../../modules/inbox-core/boot-readiness.ts';
import { bootstrap, type BootstrapResult } from '../bootstrap.ts';
import { gracefulShutdown } from '../shutdown.ts';

describe('bootstrap.integration — boot phases [integration]', () => {
  it('boot phases restore state before mutation readiness', async () => {
    // invariant: boot traverses connect→poll→reconcile→restore→ready in monotonic order
    // contract: ready=false is enforced at every phase before ready; only at ready does it flip true
    // failure mode: do not assert exact progress.done counts — they may change as phases are added

    const observed: BootState[] = [];
    let result: BootstrapResult | undefined;

    try {
      // #region START_BOOT_SETUP_OBSERVER
      result = await bootstrap({
        mocks: true,
        port: 0,
        onBootState: (state) => {
          observed.push({
            ...state,
            progress: { ...state.progress },
            worktrees: { ...state.worktrees },
          });
        },
      });
      // #endregion END_BOOT_SETUP_OBSERVER

      // #region START_BOOT_ASSERT_PHASE_SEQUENCE
      const phases = observed.map((s) => s.phase);

      assert.ok(phases.includes('connect'), 'connect phase must be observed');
      assert.ok(phases.includes('restore'), 'restore phase must be observed');
      assert.ok(phases.includes('ready'), 'ready phase must be observed');

      // Monotonic order: connect before restore, restore before ready
      const connectIdx = phases.indexOf('connect');
      const restoreIdx = phases.indexOf('restore');
      const readyIdx = phases.lastIndexOf('ready');
      assert.ok(connectIdx < restoreIdx, 'connect must precede restore');
      assert.ok(restoreIdx < readyIdx, 'restore must precede ready');
      // #endregion END_BOOT_ASSERT_PHASE_SEQUENCE

      // #region START_BOOT_ASSERT_READINESS_GATE
      // Before ready: mutation commands must be gated (ready=false at restore phase)
      const atRestore = observed.find((s) => s.phase === 'restore');
      assert.ok(atRestore, 'restore phase state must be captured by onBootState');
      assert.strictEqual(
        atRestore.ready,
        false,
        'ready must be false at restore — mutation gate is not yet open'
      );

      // After boot: ready=true, phase=ready
      const finalState = result.bootReadiness.snapshot();
      assert.strictEqual(finalState.phase, 'ready', 'final boot phase must be ready');
      assert.strictEqual(finalState.ready, true, 'ready must be true after boot completes');
      // #endregion END_BOOT_ASSERT_READINESS_GATE
    } finally {
      if (result) {
        await gracefulShutdown({
          server: result.server,
          scheduler: result.scheduler,
          opencode: result.opencode,
          opencodeProcess: result.opencodeProcess,
          opencodePidFile: result.opencodePidFile,
        });
        clearInterval(result.lifecycleReaper);
      }
    }
  });
});

setTimeout(() => process.exit(0), 60_000).unref();
