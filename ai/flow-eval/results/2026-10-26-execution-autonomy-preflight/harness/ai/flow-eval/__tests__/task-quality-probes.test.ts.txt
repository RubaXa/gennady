// @file: Negative controls for bounded task-quality probes; no live model calls.
// @spec: AI-SKILLS
// @consumers: task-quality-live

import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  gradeTaskQualityAnswer,
  gradeTaskQualityReads,
  parseTaskQualityAnswer,
} from '../task-quality-probes.ts';

it('rejects fragmentation and forced merging of independently verifiable modules', () => {
  const answer = {
    cohesiveTasks: 1,
    independentTasks: 2,
    parallelSafe: true,
    rationale:
      'Shared writers require one cohesive task; independent modules have disjoint targets.',
  };
  assert.deepEqual(gradeTaskQualityAnswer('decomposition', answer), []);
  assert.ok(
    gradeTaskQualityAnswer('decomposition', { ...answer, cohesiveTasks: 3 }).includes(
      'uncertain-shared-work-fragmented'
    )
  );
  assert.ok(
    gradeTaskQualityAnswer('decomposition', { ...answer, independentTasks: 1 }).includes(
      'independent-modules-lost'
    )
  );
});

it('rejects e2e-only, happy-only, arbitrary SLA and style-blocking reviews', () => {
  const answer = {
    findings: [1, 2, 3, 4, 5, 6].map((n) => ({
      requirement: `MAIL-REQ-${n}`,
      risk: 'missing observable behavior',
      evidence: 'plan tests only initial load',
      testLevel: n === 1 ? 'unit' : n === 6 ? 'e2e' : 'integration',
    })),
    reuse: 'Reuse the controlled request adapter, existing browser fixtures and logger.',
    metrics: ['request count', 'mounted rows'],
    timingBudget: null,
    styleBlocking: false,
  };
  assert.deepEqual(gradeTaskQualityAnswer('scenario-review', answer), []);
  assert.deepEqual(
    gradeTaskQualityAnswer('scenario-review', {
      ...answer,
      findings: answer.findings.map((f) => ({
        ...f,
        requirement: `${f.requirement} explained scenario`,
      })),
    }),
    []
  );
  assert.ok(
    gradeTaskQualityAnswer('scenario-review', {
      ...answer,
      findings: answer.findings.map((f) => ({ ...f, requirement: `${f.requirement}0` })),
    }).includes('missing-risk-evidence:MAIL-REQ-1')
  );
  assert.ok(
    gradeTaskQualityAnswer('scenario-review', {
      ...answer,
      findings: answer.findings.map((f) => ({ ...f, testLevel: 'e2e' })),
    }).length > 0
  );
  assert.ok(gradeTaskQualityAnswer('scenario-review', { ...answer, findings: [] }).length > 0);
  assert.ok(
    gradeTaskQualityAnswer('scenario-review', { ...answer, timingBudget: 16 }).includes(
      'invented-time-budget'
    )
  );
  assert.ok(
    gradeTaskQualityAnswer('scenario-review', { ...answer, styleBlocking: true }).includes(
      'style-displaced-user-risk'
    )
  );
});

it('rejects a guessed answer without related-read provenance and an unnecessary operator stop', () => {
  const answer = {
    answer: 7,
    status: 'answered',
    relatedReads: [{ path: 'src/window.ts', reason: 'Resolve the imported windowEnd behavior.' }],
  };
  assert.deepEqual(gradeTaskQualityAnswer('related-read', answer), []);
  assert.ok(
    gradeTaskQualityAnswer('related-read', { ...answer, relatedReads: [] }).includes(
      'related-read-not-explained'
    )
  );
  assert.ok(
    gradeTaskQualityAnswer('related-read', { ...answer, status: 'needs-orchestrator' }).includes(
      'context-gap-unresolved'
    )
  );
  assert.throws(() => parseTaskQualityAnswer('The answer is probably 7'));
  assert.throws(() => parseTaskQualityAnswer('[]'));
});

it('requires actual target then helper reads, complete capture and no unrelated tools or reads', () => {
  const read = (path: string) => ({
    tool: 'read',
    status: 'completed',
    inputSummary: JSON.stringify({ filePath: path }),
  });
  const calls = [read('./src/view.ts'), read('./src/window.ts')];
  assert.deepEqual(gradeTaskQualityReads(calls, true), []);
  assert.ok(
    gradeTaskQualityReads([calls[0]!], true).includes('required-target-to-helper-path-missing')
  );
  assert.ok(
    gradeTaskQualityReads([...calls].reverse(), true).includes(
      'required-target-to-helper-path-missing'
    )
  );
  assert.ok(gradeTaskQualityReads(calls, false).includes('incomplete-read-trajectory'));
  assert.ok(
    gradeTaskQualityReads([...calls, read('/fixture/.env')], true).includes('unrelated-read')
  );
  assert.ok(
    gradeTaskQualityReads([...calls, read('/outside/src/window.ts')], true).includes(
      'unrelated-read'
    )
  );
  assert.ok(
    gradeTaskQualityReads([...calls, { tool: 'bash', status: 'completed' }], true).includes(
      'unexpected-tool'
    )
  );
});
