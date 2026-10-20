// @file: Unit tests for ReviewHandoffGenerator#compose — full and delta payload verification.
// @consumers: node:test runner
// @tasks: TSK-178

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewHandoffGenerator } from '../review-handoff-generator.ts';

// ── fixed fixtures ──

const MR = {
  project: 'group/proj',
  iid: 42,
  title: 'Optimize retry logic',
  webUrl: 'https://gitlab.example.com/group/proj/-/merge_requests/42',
};

const FINDINGS = [
  {
    id: 'F-1',
    severity: 'major',
    file: 'src/retry.ts',
    line: 12,
    message: 'Missing timeout guard',
  },
  { id: 'F-2', severity: 'minor', file: 'src/cache.ts', line: 55, message: 'Stale TTL not reset' },
];

// ── unified context ──

type HandoffContext = { gen: ReviewHandoffGenerator };

function createHandoffContext(): HandoffContext {
  return { gen: new ReviewHandoffGenerator() };
}

// ── tests ──

describe('ReviewHandoffGenerator#compose', () => {
  it('full and delta handoffs include every required instruction field', () => {
    // purpose: compose() returns an immutable candidate with complete structural fields and correct
    //          mode resolution; delta carries signatures for the next diff; full text embeds all findings
    // invariant: signatures captured at compose-time; mode defaults to 'full' without a prior baseline

    const { gen } = createHandoffContext();
    const mrRef = `${MR.project}!${MR.iid}`;

    // #region START_FULL_COMPOSE_SHAPE
    const full = gen.compose(MR, FINDINGS);
    assert.strictEqual(full.mrRef, mrRef);
    assert.strictEqual(full.mode, 'full');
    assert.strictEqual(typeof full.id, 'string');
    assert.ok(full.id.length > 0);
    assert.ok(full.generatedAt.match(/^\d{4}-\d{2}-\d{2}T/));
    assert.strictEqual(full.signatures.length, FINDINGS.length);
    assert.strictEqual(full.signatures[0].file, FINDINGS[0].file);
    assert.strictEqual(full.signatures[0].line, FINDINGS[0].line);
    assert.strictEqual(typeof full.signatures[0].messageHash, 'string');
    assert.strictEqual(full.signatures[0].messageHash.length, 16);
    // #endregion END_FULL_COMPOSE_SHAPE

    // #region START_FULL_TEXT_CONTENT
    assert.match(full.text, new RegExp(MR.title));
    assert.match(full.text, /src\/retry\.ts/);
    assert.match(full.text, /Missing timeout guard/);
    assert.match(full.text, /src\/cache\.ts/);
    assert.match(full.text, /Stale TTL not reset/);
    // #endregion END_FULL_TEXT_CONTENT

    // advance baseline via acknowledged delivery
    const ackResult = gen.acknowledgeDelivery(full.id, 'success');
    assert.strictEqual(ackResult.advanced, true);
    assert.ok(ackResult.snapshot !== undefined);
    assert.strictEqual(ackResult.snapshot.deliveryCount, 1);

    // delta: replace F-2 with F-3
    const updatedFindings = [
      FINDINGS[0],
      {
        id: 'F-3',
        severity: 'major',
        file: 'src/auth.ts',
        line: 7,
        message: 'Token not validated',
      },
    ];

    // #region START_DELTA_COMPOSE_SHAPE
    const delta = gen.compose(MR, updatedFindings);
    assert.strictEqual(delta.mrRef, mrRef);
    assert.strictEqual(delta.mode, 'delta');
    assert.strictEqual(typeof delta.id, 'string');
    assert.notStrictEqual(delta.id, full.id);
    assert.strictEqual(delta.signatures.length, updatedFindings.length);
    // #endregion END_DELTA_COMPOSE_SHAPE

    // #region START_DELTA_TEXT_CONTENT
    assert.match(delta.text, /Копирование №2/);
    assert.match(delta.text, /src\/auth\.ts/);
    assert.match(delta.text, /Token not validated/);
    // resolved finding shown by file:line only (per invariant in _composeDeltaText)
    assert.match(delta.text, /src\/cache\.ts/);
    // #endregion END_DELTA_TEXT_CONTENT
  });
});
