// @file: Unit tests for deriveReviewProgress — graph node → stage, lens-track counter, elapsed clock.
// @consumers: node:test runner
// @tasks: TSK-155

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveReviewProgress } from '../review-progress.ts';
import type { PhaseTimingEntry } from '../phase-telemetry.ts';

describe('deriveReviewProgress', () => {
  /**
   * @purpose Minimal PhaseTimingEntry factory — only `ts`/`durationMs` matter for elapsed math.
   */
  function mockPhaseEntry(overrides?: Partial<PhaseTimingEntry>): PhaseTimingEntry {
    return {
      ts: '2026-07-24T00:00:10.000Z',
      mr: 'group/project!510',
      role: 'reviewer',
      node: 'node_prepare',
      model: 'default',
      durationMs: 10_000,
      ok: true,
      retries: 0,
      ...overrides,
    };
  }

  it('maps graph node to a human stage', () => {
    const progress = deriveReviewProgress({
      currentNode: 'node_review_fanout',
      artifacts: {},
      phaseEntries: [],
    });

    assert.strictEqual(progress.stage, 'reviewing');
    assert.strictEqual(progress.stageLabel, 'Ревью');
  });

  it('counts planned/done/in-progress lens tracks', () => {
    // contract: review_needed always plans 3 fixed lens tracks regardless of which have run

    const progress = deriveReviewProgress({
      currentNode: 'node_review_fanout',
      artifacts: {
        node_track_review: { findings: [] },
      },
      phaseEntries: [],
    });

    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 1);
    assert.ok(progress.tracksInProgress.includes('безопасность'));
    assert.ok(progress.tracksInProgress.includes('код-ревью'));
  });

  it('computes elapsed from injected nowMs', () => {
    // contract: elapsed is deterministic from injected nowMs, not real Date.now()

    const startMs = new Date('2026-07-24T00:00:00.000Z').getTime();
    const phaseEntries = [mockPhaseEntry({ ts: '2026-07-24T00:00:10.000Z', durationMs: 10_000 })];
    const nowMs = startMs + 25_000;

    const progress = deriveReviewProgress({
      currentNode: 'node_prepare',
      artifacts: {},
      phaseEntries,
      nowMs,
    });

    assert.strictEqual(progress.elapsedMs, 25_000);
    assert.strictEqual(progress.startedAt, new Date(startMs).toISOString());
  });
});
