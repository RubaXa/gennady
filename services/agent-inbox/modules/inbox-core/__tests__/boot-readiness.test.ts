// @file: Unit tests for BootReadiness — boot-phase state machine, snapshot contract, failure path, config status, listener lifecycle
// @consumers: node:test runner
// @tasks: TSK-157

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BootReadiness, type BootState } from '../boot-readiness.ts';

function createBootReadinessContext() {
  const boot = new BootReadiness();
  return { boot };
}

describe('BootReadiness', () => {
  it('provides snapshot before any transition', () => {
    // contract: /api/boot snapshot available immediately after construction — before connect
    // invariant: initial phase=connect, ready=false, configured=true, missing=[]

    const { boot } = createBootReadinessContext();

    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'connect');
    assert.strictEqual(state.ready, false);
    assert.strictEqual(state.configured, true);
    assert.deepStrictEqual(state.missing, []);
    assert.strictEqual(state.progress.done, 0);
    assert.strictEqual(state.progress.total, 5);
    assert.strictEqual(state.progress.label, 'connect');
  });

  it('transitions connect→poll and progress is monotonic', () => {
    // contract: phase transitions are monotonic — never regress
    // invariant: progress.done increments on each non-terminal transition

    const { boot } = createBootReadinessContext();

    boot.transition('poll');
    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'poll');
    assert.strictEqual(state.progress.done, 1);
    assert.strictEqual(state.progress.label, 'poll');
    assert.strictEqual(state.progress.total, 5);
    assert.strictEqual(state.ready, false);
  });

  it('transitions poll→reconcile', () => {
    const { boot } = createBootReadinessContext();

    boot.transition('poll');
    boot.transition('reconcile');
    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'reconcile');
    assert.strictEqual(state.progress.done, 2);
    assert.strictEqual(state.progress.label, 'reconcile');
  });

  it('transitions reconcile→restore', () => {
    const { boot } = createBootReadinessContext();

    boot.transition('poll');
    boot.transition('reconcile');
    boot.transition('restore');
    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'restore');
    assert.strictEqual(state.progress.done, 3);
    assert.strictEqual(state.progress.label, 'restore');
  });

  it('transitions restore→ready and marks ready=true', () => {
    // contract: ready phase sets ready=true and progress to terminal

    const { boot } = createBootReadinessContext();

    boot.transition('poll');
    boot.transition('reconcile');
    boot.transition('restore');
    boot.transition('ready');

    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'ready');
    assert.strictEqual(state.ready, true);
    assert.strictEqual(state.progress.done, 5);
    assert.strictEqual(state.progress.total, 5);
    assert.strictEqual(state.progress.label, 'ready');
  });

  it('silently skips duplicate phase transition (no regression)', () => {
    // contract: same-phase transition is a no-op — no regression, no throw, no duplicate listener fire

    const { boot } = createBootReadinessContext();

    boot.transition('poll');
    const progressAfterFirst = boot.snapshot().progress.done;

    boot.transition('poll');
    const progressAfterSecond = boot.snapshot().progress.done;

    assert.strictEqual(progressAfterFirst, progressAfterSecond);
    assert.strictEqual(boot.snapshot().phase, 'poll');
  });

  it('silently ignores backward transition (no regression, no throw)', () => {
    // contract: phase regression attempt is silently ignored — does not regress, does not throw

    const { boot } = createBootReadinessContext();

    boot.transition('poll');
    boot.transition('reconcile');

    boot.transition('poll');

    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'reconcile');
    assert.strictEqual(state.progress.done, 2);
  });

  it('fail() transitions to failed with reason', () => {
    // contract: fail() sets phase=failed, error=reason, ready=false
    // invariant: error is stored and retrievable via snapshot

    const { boot } = createBootReadinessContext();

    boot.fail('VCS unreachable after 3 retries');

    const state = boot.snapshot();
    assert.strictEqual(state.phase, 'failed');
    assert.strictEqual(state.ready, false);
    assert.strictEqual(state.error, 'VCS unreachable after 3 retries');
  });

  it('listener fires on every phase transition', () => {
    // contract: listener registered before any transition receives all state changes
    // invariant: listener receives exact snapshot at each transition point

    const { boot } = createBootReadinessContext();
    const states: BootState[] = [];

    boot.onTransition((s) => states.push(s));

    boot.transition('poll');
    boot.transition('reconcile');
    boot.transition('restore');

    assert.strictEqual(states.length, 3);
    assert.strictEqual(states[0].phase, 'poll');
    assert.strictEqual(states[1].phase, 'reconcile');
    assert.strictEqual(states[2].phase, 'restore');
  });

  it('listener fires on fail()', () => {
    // contract: fail() fires listeners with failed state + error reason

    const { boot } = createBootReadinessContext();
    const states: BootState[] = [];

    boot.onTransition((s) => states.push(s));
    boot.fail('disk full');

    assert.strictEqual(states.length, 1);
    assert.strictEqual(states[0].phase, 'failed');
    assert.strictEqual(states[0].error, 'disk full');
  });

  it('broken config yields failed phase without throw', () => {
    // contract: setConfigStatus(false, missing) → configured=false, missing keys exposed; no throw
    // invariant: boot doesn't crash — failed phase communicates config gap to /api/boot consumers

    const { boot } = createBootReadinessContext();

    assert.doesNotThrow(() => {
      boot.setConfigStatus(false, ['reposBase', 'vcsHost']);
    });

    const state = boot.snapshot();
    assert.strictEqual(state.configured, false);
    assert.deepStrictEqual(state.missing, ['reposBase', 'vcsHost']);
  });

  it('config status settable independently of phase transitions', () => {
    // contract: config status can be set before, during, or independently of phase transitions

    const { boot } = createBootReadinessContext();

    boot.setConfigStatus(true);
    const before = boot.snapshot();
    assert.strictEqual(before.configured, true);
    assert.deepStrictEqual(before.missing, []);

    boot.transition('poll');
    boot.setConfigStatus(false, ['vcsHost']);

    const after = boot.snapshot();
    assert.strictEqual(after.phase, 'poll');
    assert.strictEqual(after.configured, false);
    assert.deepStrictEqual(after.missing, ['vcsHost']);
  });
});
