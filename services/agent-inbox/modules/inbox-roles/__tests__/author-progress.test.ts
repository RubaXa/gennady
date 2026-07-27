// @file: author-progress.test.ts — unit proof: deriveReviewProgress for author role
//   with real data through all stages. No server, no opencode — pure logic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveReviewProgress } from '../review-progress.ts';

const NOW = Date.now();
const TEN_MIN_AGO = new Date(NOW - 600_000).toISOString();

describe('deriveReviewProgress — author role stages', () => {
  it('stage 1: Саморевью (node_self_review), 0/3 done, clock ticking', () => {
    const progress = deriveReviewProgress({
      currentNode: 'node_self_review',
      artifacts: {},
      phaseEntries: [],
      role: 'author',
      instanceCreatedAt: TEN_MIN_AGO,
      nowMs: NOW,
    });

    assert.strictEqual(progress.stage, 'reviewing');
    assert.strictEqual(progress.stageLabel, 'Саморевью');
    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 0);
    assert.deepStrictEqual(progress.tracksInProgress, [
      'саморевью',
      'анализ фидбека',
      'синтез',
    ]);
    assert.ok(progress.elapsedMs > 500_000, 'clock should show ~10 min elapsed');
    assert.ok(progress.startedAt !== null, 'startedAt should be set from instanceCreatedAt');
    assert.strictEqual(progress.activity, 'Саморевью кода');
  });

  it('stage 2: Анализ фидбека (node_analyze_feedback), 1/3 done', () => {
    const progress = deriveReviewProgress({
      currentNode: 'node_analyze_feedback',
      artifacts: {
        node_self_review: { findings: [{ file: 'a.ts', line: 1, message: 'ok' }] },
      },
      phaseEntries: [],
      role: 'author',
      instanceCreatedAt: TEN_MIN_AGO,
      nowMs: NOW,
    });

    assert.strictEqual(progress.stage, 'reviewing');
    assert.strictEqual(progress.stageLabel, 'Анализ фидбека');
    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 1);
    assert.deepStrictEqual(progress.tracksInProgress, ['анализ фидбека', 'синтез']);
    assert.strictEqual(progress.activity, 'Анализ отзывов ревьюеров');
  });

  it('stage 3: Синтез (node_synthesize), 2/3 done', () => {
    const progress = deriveReviewProgress({
      currentNode: 'node_synthesize',
      artifacts: {
        node_self_review: { findings: [{ file: 'a.ts', line: 1, message: 'ok' }] },
        node_analyze_feedback: { findings: [{ file: 'b.ts', line: 2, message: 'ok' }] },
      },
      phaseEntries: [],
      role: 'author',
      instanceCreatedAt: TEN_MIN_AGO,
      nowMs: NOW,
    });

    assert.strictEqual(progress.stage, 'synthesis');
    assert.strictEqual(progress.stageLabel, 'Синтез');
    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 2);
    assert.deepStrictEqual(progress.tracksInProgress, ['синтез']);
    assert.strictEqual(progress.activity, 'Синтез отчёта');
  });

  it('stage 4: Готово (done), 3/3 done', () => {
    const progress = deriveReviewProgress({
      currentNode: 'done',
      artifacts: {
        node_self_review: { findings: [{ file: 'a.ts', line: 1, message: 'ok' }] },
        node_analyze_feedback: { findings: [{ file: 'b.ts', line: 2, message: 'ok' }] },
        node_synthesize: {
          reviewReport: { summary: 'ok', verdict: 'ok', behavior: 'ok', scenarios: 'ok' },
        },
      },
      phaseEntries: [],
      role: 'author',
      instanceCreatedAt: TEN_MIN_AGO,
      nowMs: NOW,
    });

    assert.strictEqual(progress.stage, 'done');
    assert.strictEqual(progress.stageLabel, 'Готово');
    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 3);
    assert.deepStrictEqual(progress.tracksInProgress, []);
    assert.strictEqual(progress.activity, 'Готово');
  });

  it('reviewer still shows 3 lenses with correct labels', () => {
    const progress = deriveReviewProgress({
      currentNode: 'node_review_fanout',
      artifacts: {},
      phaseEntries: [],
      role: 'reviewer',
      nowMs: NOW,
    });

    assert.strictEqual(progress.stage, 'reviewing');
    assert.strictEqual(progress.stageLabel, 'Ревью');
    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 0);
    assert.deepStrictEqual(progress.tracksInProgress, [
      'трек-ревью',
      'безопасность',
      'код-ревью',
    ]);
  });

  it('enrich stage shows correctly for reviewer', () => {
    const progress = deriveReviewProgress({
      currentNode: 'node_enrich',
      artifacts: {},
      phaseEntries: [],
      role: 'reviewer',
      nowMs: NOW,
    });

    assert.strictEqual(progress.stage, 'planning');
    assert.strictEqual(progress.stageLabel, 'Обогащение контекста');
    assert.strictEqual(progress.activity, 'Обогащение контекста задач');
    assert.strictEqual(progress.tracksPlanned, 3);
    assert.strictEqual(progress.tracksDone, 0);
  });
});
