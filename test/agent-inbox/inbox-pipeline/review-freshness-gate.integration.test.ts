// @file: Integration test for three serialized local freshness boundaries.
// @consumers: TSK-176 audit
// @tasks: TSK-176

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ReviewFreshnessGate,
  type ReviewFreshnessJournal,
  type ReviewFreshnessPurpose,
} from '../../../services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts';

type FreshnessContext = {
  observed: Map<string, string>;
  events: string[];
  gate: ReviewFreshnessGate;
};
function createFreshnessContext(): FreshnessContext {
  const observed = new Map([
    ['g/p!1', 'h:e'],
    ['g/p!2', 'h2:e2'],
  ]);
  const events: string[] = [];
  const journal: ReviewFreshnessJournal = {
    retrieveObservedRevision: (mr) => observed.get(mr),
    recordTransition: (purpose, key) => events.push(`${purpose}:fresh:${key.mr}`),
    recordStale: (purpose, key) => events.push(`${purpose}:stale:${key.mr}`),
  };
  const gate = new ReviewFreshnessGate(journal, (_purpose, key) => ({
    actionCapabilities: { comment: true },
    capabilityVersion: 'v1',
    dispatchPolicy: { kind: 'CONDITIONAL_SHA', expectedHeadSHA: key.headSHA },
  }));
  return { observed, events, gate };
}

describe('ReviewFreshnessGate', () => {
  it('verdict publication and handoff are separately guarded by exact observed revision', async () => {
    const { gate, observed, events } = createFreshnessContext();
    const key = { mr: 'g/p!1', headSHA: 'h', eventCursor: 'e' };
    const purposes: ReviewFreshnessPurpose[] = [
      'VERDICT',
      'SYNTHESIS_PUBLICATION',
      'QUEUE_HANDOFF',
    ];
    const results = await Promise.all(
      purposes.map((purpose) => gate.guard(purpose, key, () => purpose))
    );
    assert.deepStrictEqual(
      results.map((result) => result.status),
      ['FRESH', 'FRESH', 'FRESH']
    );
    observed.set(key.mr, 'new:new');
    let invoked = false;
    const stale = await gate.guard('VERDICT', key, () => {
      invoked = true;
    });
    assert.strictEqual(stale.status, 'STALE');
    assert.strictEqual(invoked, false);
    assert.strictEqual(events.length, 4);
  });
});
