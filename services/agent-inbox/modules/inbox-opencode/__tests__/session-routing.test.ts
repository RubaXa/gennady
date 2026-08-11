// @file: Unit contract for independent agent-session context routing.
// @consumers: node:test runner
// @tasks: TSK-175

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ControlledClock } from '../../inbox-core/adapters/controlled-clock.ts';
import { InMemoryJournal } from '../../inbox-core/adapters/in-memory-journal.ts';
import { AgentSessionLifecycle } from '../session-lifecycle.ts';
import { SessionRegistry } from '../session-registry.ts';

type SessionRoutingContext = {
  lifecycle: AgentSessionLifecycle;
};

function createSessionRoutingContext(): SessionRoutingContext {
  return {
    lifecycle: new AgentSessionLifecycle(new SessionRegistry(), new InMemoryJournal(), undefined, {
      clock: new ControlledClock('2026-08-10T10:00:00.000Z'),
    }),
  };
}

describe('AgentSessionLifecycle#route', () => {
  it('widen and fact check select independent context', async () => {
    const { lifecycle } = createSessionRoutingContext();
    const [widen, factCheck] = await Promise.all([
      lifecycle.route({
        policy: 'widen',
        taskId: 'widen-1',
        mr: 'group/project!1',
        runtimeNamespace: 'test',
      }),
      lifecycle.route({
        policy: 'fact_check',
        taskId: 'fact-1',
        mr: 'group/project!1',
        runtimeNamespace: 'test',
      }),
    ]);
    assert.deepStrictEqual(widen, { action: 'fresh', reason: 'independent_context' });
    assert.deepStrictEqual(factCheck, { action: 'fresh', reason: 'independent_context' });
  });
});
