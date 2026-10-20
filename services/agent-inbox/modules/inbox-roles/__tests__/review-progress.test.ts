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

  it('ignores phase entries from a previous run when the instance was just (re)created (live bug, 2026-07-28)', () => {
    // contract: an instance resumed from disk must report elapsed since ITS creation, not since the
    // MR's first-ever review days earlier — phase-timings.jsonl is append-only and MR-keyed, so old
    // entries from a prior completed review must not leak into a freshly re-assigned instance's clock.

    const oldRunEntry = mockPhaseEntry({ ts: '2026-07-23T10:04:43.785Z', durationMs: 243_058 });
    const instanceCreatedAt = '2026-07-28T13:57:20.077Z';
    const nowMs = new Date(instanceCreatedAt).getTime() + 5_000;

    const progress = deriveReviewProgress({
      currentNode: 'node_thread_triage',
      artifacts: {},
      phaseEntries: [oldRunEntry],
      instanceCreatedAt,
      nowMs,
    });

    assert.strictEqual(progress.elapsedMs, 5_000, 'must count from re-assignment, not 2026-07-23');
    assert.strictEqual(progress.startedAt, instanceCreatedAt);
  });

  it('reports 0 planned tracks outside the review-fanout branch (live bug, 2026-07-28)', () => {
    // contract: node_thread_triage (reply_needed sub-flow) never runs the 3 review-fanout lenses —
    // showing "0/3 трек-ревью/безопасность/код-ревью" there falsely implies a fresh full review is
    // about to start, when the instance is really just checking existing GitLab discussion threads.

    const progress = deriveReviewProgress({
      currentNode: 'node_thread_triage',
      artifacts: {},
      phaseEntries: [],
      role: 'reviewer',
    });

    assert.strictEqual(progress.tracksPlanned, 0);
    assert.strictEqual(progress.tracksDone, 0);
    assert.deepStrictEqual(progress.tracksInProgress, []);
  });
});
