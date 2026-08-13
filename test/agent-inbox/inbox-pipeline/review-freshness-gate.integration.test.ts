// @file: Integration test for three serialized local freshness boundaries.
// @consumers: TSK-176 audit, TSK-184 production control-plane verification, TSK-190 atomicity audit
// @tasks: TSK-176, TSK-184, TSK-190

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
    recordGuardTransaction: async (purpose, key, _revision, transition) => {
      events.push(`${purpose}:${transition ? 'fresh' : 'stale'}:${key.mr}`);
    },
  };
  const gate = new ReviewFreshnessGate(journal, (_purpose, key) => ({
    actionCapabilities: { comment: true },
    capabilityVersion: 'v1',
    dispatchPolicy: { kind: 'CONDITIONAL_SHA', expectedHeadSHA: key.headSHA },
  }));
  return { observed, events, gate };
}

describe('ReviewFreshnessGate', () => {
  it('does not invoke a queue or effect callback when durable transition append rejects', async () => {
    let effectCount = 0;
    const gate = new ReviewFreshnessGate(
      {
        recordGuardTransaction: async () => {
          throw new Error('durable append rejected');
        },
      },
      () => ({
        actionCapabilities: {},
        capabilityVersion: 'v1',
        dispatchPolicy: { kind: 'RECONCILE_AFTER_EFFECT' },
      })
    );

    await assert.rejects(
      gate.guard(
        'QUEUE_HANDOFF',
        { mr: 'g/p!1', headSHA: 'h', eventCursor: 'e' },
        () => 'h:e',
        () => {
          effectCount += 1;
        }
      ),
      /durable append rejected/
    );
    assert.strictEqual(effectCount, 0);
  });

  it('observed update compare and transition append are one per MR transaction', async () => {
    const transactions: string[] = [];
    let callbackCount = 0;
    const gate = new ReviewFreshnessGate(
      {
        recordGuardTransaction: async (_purpose, _key, observed, transition) => {
          transactions.push(`${observed}:${transition ? 'MATCH' : 'STALE'}`);
        },
      },
      () => ({
        actionCapabilities: {},
        capabilityVersion: 'v1',
        dispatchPolicy: { kind: 'RECONCILE_AFTER_EFFECT' },
      })
    );
    const result = await gate.guard(
      'VERDICT',
      { mr: 'g/p!race', headSHA: 'head-a', eventCursor: 'cursor-a' },
      () => 'head-b:cursor-b',
      () => {
        callbackCount += 1;
      }
    );
    assert.deepStrictEqual(result, {
      status: 'STALE',
      expectedRevision: 'head-a:cursor-a',
      observedRevision: 'head-b:cursor-b',
      deltaRequested: true,
    });
    assert.deepStrictEqual(transactions, ['head-b:cursor-b:STALE']);
    assert.strictEqual(callbackCount, 0);
  });

  it('matching freshness transition invokes callback after the same atomic append', async () => {
    const { gate, observed, events } = createFreshnessContext();
    const key = { mr: 'g/p!1', headSHA: 'h', eventCursor: 'e' };
    const purposes: ReviewFreshnessPurpose[] = [
      'VERDICT',
      'SYNTHESIS_PUBLICATION',
      'QUEUE_HANDOFF',
    ];
    const results = await Promise.all(
      purposes.map((purpose) =>
        gate.guard(
          purpose,
          key,
          () => observed.get(key.mr),
          () => purpose
        )
      )
    );
    assert.deepStrictEqual(
      results.map((result) => result.status),
      ['FRESH', 'FRESH', 'FRESH']
    );
    observed.set(key.mr, 'new:new');
    let invoked = false;
    const stale = await gate.guard(
      'VERDICT',
      key,
      () => observed.get(key.mr),
      () => {
        invoked = true;
      }
    );
    assert.strictEqual(stale.status, 'STALE');
    assert.strictEqual(invoked, false);
    assert.strictEqual(events.length, 4);
  });
});
