// @file: Unit tests for createMonitor factory function
// @consumers: monitor
// @tasks: TSK-36

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMonitor } from '../create-monitor.ts';
import { AgentMonitor } from '../agent-monitor.ts';

describe('createMonitor', () => {
  it('returns an AgentMonitor instance', () => {
    // purpose: verify factory contract — createMonitor() must return a valid AgentMonitor instance
    // contract: returned value is instanceof AgentMonitor with an empty provider registry

    // #region START_CREATE_INSTANCE_SETUP
    const monitor = createMonitor();
    // #endregion END_CREATE_INSTANCE_SETUP

    // #region START_CREATE_INSTANCE_ASSERT
    assert.ok(monitor instanceof AgentMonitor);
    // #endregion END_CREATE_INSTANCE_ASSERT
  });

  it('returns a fresh instance on each call', () => {
    // purpose: verify factory isolation — each call to createMonitor returns a distinct instance with independent state
    // invariant: two monitors created by the factory must not share provider registries

    // #region START_CREATE_FRESH_SETUP
    const monitor1 = createMonitor();
    const monitor2 = createMonitor();
    // #endregion END_CREATE_FRESH_SETUP

    // #region START_CREATE_FRESH_ASSERT
    assert.notStrictEqual(monitor1, monitor2);
    // #endregion END_CREATE_FRESH_ASSERT
  });
});
