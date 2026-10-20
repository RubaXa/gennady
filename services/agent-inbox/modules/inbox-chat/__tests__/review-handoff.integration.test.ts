// @file: Integration tests for ReviewHandoffGenerator delivery baseline — receipt handling and failure paths.
// @consumers: node:test runner
// @tasks: TSK-178

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewHandoffGenerator } from '../review-handoff-generator.ts';

const MR = {
  project: 'group/proj',
  iid: 99,
  title: 'Feature A',
  webUrl: 'https://gitlab.example.com/group/proj/-/merge_requests/99',
};

const FINDINGS = [{ severity: 'major', file: 'a.ts', line: 1, message: 'null deref' }];

const MR_REF = `${MR.project}!${MR.iid}`;

describe('ReviewHandoffGenerator — delivery baseline integration', () => {
  it('failed clipboard receipt never advances delivered baseline', () => {
    // purpose: only receipt='success' may advance the baseline; all other outcomes are no-ops
    // invariant: retrieveSnapshot() returns null until a 'success' receipt is acknowledged

    const gen = new ReviewHandoffGenerator();

    const candidate = gen.compose(MR, FINDINGS);
    assert.strictEqual(gen.retrieveSnapshot(MR_REF), null);

    const result = gen.acknowledgeDelivery(candidate.id, 'failed');
    assert.strictEqual(result.advanced, false);
    assert.strictEqual(result.snapshot, undefined);
    assert.strictEqual(gen.retrieveSnapshot(MR_REF), null);
  });

  it('empty missing duplicate stale wrong MR and mutation conflict paths preserve baseline and artifact revision', () => {
    // purpose: every non-success and conflict path must leave the last-delivered baseline unchanged
    // failure mode: none of the paths below should advance deliveryCount or replace the snapshot

    // empty delta: compose with identical findings after baseline → delta text is explicit ("Ничего нового")
    // #region START_EMPTY_DELTA_SETUP
    const genA = new ReviewHandoffGenerator();
    const firstA = genA.compose(MR, FINDINGS);
    genA.acknowledgeDelivery(firstA.id, 'success');
    const emptyDelta = genA.compose(MR, FINDINGS);
    // #endregion END_EMPTY_DELTA_SETUP
    assert.strictEqual(emptyDelta.mode, 'delta');
    assert.match(emptyDelta.text, /Ничего нового/);

    // empty findings: generation succeeds in full mode with explicit "(нет находок)" text
    const genB = new ReviewHandoffGenerator();
    const noFindings = genB.compose(MR, []);
    assert.strictEqual(noFindings.mode, 'full');
    assert.match(noFindings.text, /нет находок/);

    // invalid receipts: duplicate, stale, wrong-mr — none advance baseline
    // #region START_INVALID_RECEIPTS_SETUP
    const genC = new ReviewHandoffGenerator();
    const candidateC = genC.compose(MR, FINDINGS);
    // #endregion END_INVALID_RECEIPTS_SETUP
    for (const receipt of ['duplicate', 'stale', 'wrong-mr'] as const) {
      const r = genC.acknowledgeDelivery(candidateC.id, receipt);
      assert.strictEqual(r.advanced, false, `receipt '${receipt}' must not advance baseline`);
    }
    assert.strictEqual(genC.retrieveSnapshot(MR_REF), null);

    // success advances once; second call with the same handoffId returns false (pending cleared after ack)
    const genD = new ReviewHandoffGenerator();
    const handoffD = genD.compose(MR, FINDINGS);
    const firstAck = genD.acknowledgeDelivery(handoffD.id, 'success');
    assert.strictEqual(firstAck.advanced, true);
    assert.ok(firstAck.snapshot !== undefined);
    const secondAck = genD.acknowledgeDelivery(handoffD.id, 'success');
    assert.strictEqual(secondAck.advanced, false);

    // conflict: compose() replaces pending; stale pending ID cannot advance baseline;
    //           current revision (snapshot) is preserved and undo remains available via new candidate
    // #region START_CONFLICT_SETUP
    const genE = new ReviewHandoffGenerator();
    const h1 = genE.compose(MR, FINDINGS);
    genE.acknowledgeDelivery(h1.id, 'success'); // baseline established (deliveryCount=1)
    const snap1 = genE.retrieveSnapshot(MR_REF);
    assert.ok(snap1 !== null);
    const h2 = genE.compose(MR, FINDINGS); // pending = h2
    const h3 = genE.compose(MR, FINDINGS); // pending = h3; h2 is superseded (conflict)
    // #endregion END_CONFLICT_SETUP
    const staleAck = genE.acknowledgeDelivery(h2.id, 'success');
    assert.strictEqual(staleAck.advanced, false);
    assert.deepStrictEqual(genE.retrieveSnapshot(MR_REF), snap1); // current revision preserved
    // undo available: h3 is still the active candidate and can advance the baseline
    const h3Ack = genE.acknowledgeDelivery(h3.id, 'success');
    assert.strictEqual(h3Ack.advanced, true);
    assert.ok(h3Ack.snapshot !== undefined);
    assert.strictEqual(h3Ack.snapshot.deliveryCount, 2);
  });
});
