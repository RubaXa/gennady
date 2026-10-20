// @file: BDD type-level contract test — TSK-178 chat/handoff entity inventory exhaustiveness.
// @consumers: node:test runner
// @tasks: TSK-178

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ReviewHandoff,
  ReviewHandoffSnapshot,
  ReviewHandoffDelivery,
} from '../review-handoff-generator.ts';
import type { ChatTurn, MutationProposal, ReviewSnapshot } from '../types.ts';
import type { Anchor, AnchorResolution } from '../anchor.ts';

// Test Graph: single case — exhaustive field + closed-union coverage for all handoff/mutation/anchor entity types

describe('ReviewHandoffGenerator — type contracts', () => {
  it('chat handoff and mutation contracts are exhaustive', () => {
    // purpose: prove every exported entity in the closed-world inventory is structurally complete
    // invariant: missing required field or invalid enum value → TypeScript compile error

    // #region START_CONTRACT_HANDOFF_SHAPE
    const handoff: ReviewHandoff = {
      id: 'uuid-1',
      mrRef: 'group/proj!42',
      mode: 'full',
      text: '# fix task',
      generatedAt: '2026-08-11T00:00:00.000Z',
      signatures: [{ file: 'src/a.ts', line: 1, messageHash: 'deadbeef12345678' }],
    };
    assert.ok(handoff.mode === 'full' || handoff.mode === 'delta');
    assert.ok(Array.isArray(handoff.signatures));
    assert.strictEqual(typeof handoff.signatures[0].messageHash, 'string');
    // @ts-expect-error — 'emit' is not in the mode closed union ('full' | 'delta')
    const _badMode: ReviewHandoff = { ...handoff, mode: 'emit' };
    assert.strictEqual(typeof _badMode.mode, 'string');
    // #endregion END_CONTRACT_HANDOFF_SHAPE

    // #region START_CONTRACT_SNAPSHOT_SHAPE
    const snapshot: ReviewHandoffSnapshot = {
      id: 'snap-1',
      mrRef: 'group/proj!42',
      handoffId: 'uuid-1',
      deliveredAt: '2026-08-11T00:00:01.000Z',
      deliveryCount: 1,
      signatures: [],
    };
    assert.strictEqual(typeof snapshot.deliveryCount, 'number');
    assert.ok(Array.isArray(snapshot.signatures));
    // #endregion END_CONTRACT_SNAPSHOT_SHAPE

    // #region START_CONTRACT_DELIVERY_RECEIPT
    const validReceipts: ReviewHandoffDelivery['receipt'][] = [
      'success',
      'duplicate',
      'stale',
      'wrong-mr',
      'failed',
    ];
    for (const receipt of validReceipts) {
      const delivery: ReviewHandoffDelivery = {
        handoffId: 'uuid-1',
        receipt,
        deliveredAt: '2026-08-11T00:00:02.000Z',
      };
      assert.strictEqual(delivery.receipt, receipt);
    }
    // @ts-expect-error — 'error' is not in the receipt closed union
    const _badReceipt: ReviewHandoffDelivery = {
      handoffId: 'x',
      receipt: 'error',
      deliveredAt: '',
    };
    assert.strictEqual(typeof _badReceipt.receipt, 'string');
    // #endregion END_CONTRACT_DELIVERY_RECEIPT

    // #region START_CONTRACT_MUTATION_PROPOSAL
    const validOps: MutationProposal['op'][] = ['edit', 'remove', 'set-severity'];
    for (const op of validOps) {
      const proposal: MutationProposal = { op, target: 'F-1', before: null, after: null };
      assert.strictEqual(proposal.op, op);
    }
    // @ts-expect-error — 'add' is not in op closed set (D-90 v1 only; deferred per spec)
    const _invalidOp: MutationProposal = { op: 'add', target: 'F-1', before: null, after: null };
    assert.strictEqual(typeof _invalidOp.op, 'string');
    // #endregion END_CONTRACT_MUTATION_PROPOSAL

    // #region START_CONTRACT_ANCHOR_VARIANTS
    const textAnchor: Anchor = {
      widgetId: 'findings',
      artifactPath: 'review.json',
      fragment: { start: 0, end: 9 },
      quote: 'major bug',
    };
    const elemAnchor: Anchor = { widgetId: 'diagram', elementId: 'node-1' };
    const resolved: AnchorResolution = {
      state: 'resolved',
      anchor: textAnchor,
      fragment: { start: 0, end: 9 },
    };
    const stale: AnchorResolution = { state: 'stale', anchor: elemAnchor };
    assert.strictEqual(resolved.state, 'resolved');
    assert.strictEqual(stale.state, 'stale');
    // #endregion END_CONTRACT_ANCHOR_VARIANTS

    // #region START_CONTRACT_CHAT_TURN_AND_REVIEW_SNAPSHOT
    const turn: ChatTurn = {
      id: 'turn-1',
      ts: '2026-08-11T00:00:03.000Z',
      question: 'why is this flagged?',
      chips: [],
      answer: 'the retry path lacks a timeout guard',
      reviewRevision: 0,
    };
    assert.ok(Array.isArray(turn.chips));
    assert.strictEqual(typeof turn.reviewRevision, 'number');

    const reviewSnapshot: ReviewSnapshot = {
      id: 'revsnap-1',
      mrRef: 'group/proj!42',
      ts: '2026-08-11T00:00:04.000Z',
      revision: 0,
      path: 'reports/group-proj-42/snapshots/revsnap-1.json',
    };
    assert.strictEqual(typeof reviewSnapshot.revision, 'number');
    assert.strictEqual(typeof reviewSnapshot.path, 'string');
    // #endregion END_CONTRACT_CHAT_TURN_AND_REVIEW_SNAPSHOT
  });
});
