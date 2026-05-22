// @file: Unit tests for createStateManager lifecycle — loading/ready/error transitions
// @consumers: test
// @tasks: TSK-45

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStateManager } from '../create-state-manager.ts';
import type { SessionChanges } from '../../../../../services/agent-mon/model/session-changes.type.ts';
import type { AgentSession } from '../../../../../services/agent-mon/model/agent-session.type.ts';

/**
 * @purpose Minimal valid AgentSession factory for state manager tests.
 */
function makeSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    provider: 'test',
    pid: 42,
    sessionId: 'sess-1',
    title: 'Test Session',
    cwd: '/tmp/test',
    status: 'active',
    startedAt: 1000,
    elapsedSeconds: 10,
    ...overrides,
  };
}

describe('createStateManager', () => {
  it('transitions loading to ready', async () => {
    // contract: first subscribe call before iteration → status='loading'
    // contract: after first successful iteration → status='ready', data populated
    // invariant: data.columns reflects the merged sessions from SessionChanges

    const session = makeSession();

    async function* gen(): AsyncIterable<SessionChanges> {
      yield { added: [session], removed: [], updated: [] };
    }

    const manager = createStateManager(gen());

    // Initial state is loading
    assert.strictEqual(manager.getViewModel().status, 'loading');

    // Wait for transition to ready via subscribe
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>(r => { resolveReady = r; });
    const unsub = manager.subscribe((vm) => {
      if (vm.status === 'ready') resolveReady!();
    });

    await ready;
    unsub();

    const vm = manager.getViewModel();
    assert.strictEqual(vm.status, 'ready');
    assert.ok(vm.data);
    assert.strictEqual(vm.data!.columns.length, 1);
    assert.strictEqual(vm.data!.summary.total, 1);
  });

  it('transitions to error on observer failure', async () => {
    // contract: error in observer → status='error', data preserves last successful scan
    // failure mode: error must be Error instance; message must contain the original cause

    const session = makeSession();

    async function* gen(): AsyncIterable<SessionChanges> {
      yield { added: [session], removed: [], updated: [] };
      throw new Error('observer failure');
    }

    const manager = createStateManager(gen());

    // Wait for error transition
    let resolveError: (() => void) | undefined;
    const errorState = new Promise<void>(r => { resolveError = r; });
    const unsub = manager.subscribe((vm) => {
      if (vm.status === 'error') resolveError!();
    });

    await errorState;
    unsub();

    const vm = manager.getViewModel();
    assert.strictEqual(vm.status, 'error');
    assert.ok(vm.error);
    assert.match(vm.error!.message, /observer failure/);
    // data preserves last successful scan
    assert.ok(vm.data);
    assert.strictEqual(vm.data!.columns.length, 1);
  });
});
