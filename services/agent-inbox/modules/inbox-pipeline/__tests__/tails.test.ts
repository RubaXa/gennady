// @file: Tests for AuthorTail and ReviewerTail — findings summary, thread dedup, posting candidates, role-specific notifications
// @consumers: node:test runner
// @tasks: TSK-161

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthorTail } from '../tails/author-tail.ts';
import { ReviewerTail } from '../tails/reviewer-tail.ts';
import type { FindingEntry, FindingMark, FindingSeverity } from '../findings-journal.ts';

function createFinding(overrides?: Partial<FindingEntry>): FindingEntry {
  return {
    id: 'F-1',
    file: 'src/index.ts',
    line: 10,
    summary: 'unused variable x',
    severity: 'warning' as FindingSeverity,
    source: [{ model: 'deepseek', runId: 'run-001' }],
    mark: 'consensus' as FindingMark,
    ...overrides,
  };
}

describe('AuthorTail', () => {
  it('summary includes verdict finding count and MR info', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', severity: 'error' }),
      createFinding({ id: 'F-2', severity: 'warning' }),
      createFinding({ id: 'F-3', severity: 'info' }),
    ];
    const tail = new AuthorTail();

    const notification = tail.prepare('test/project!42', 'REQUEST_CHANGES', findings);

    assert.strictEqual(notification.mr, 'test/project!42');
    assert.strictEqual(notification.verdict, 'REQUEST_CHANGES');
    assert.strictEqual(notification.findingsCount, 3);
    assert.strictEqual(notification.bySeverity.error, 1);
    assert.strictEqual(notification.bySeverity.warning, 1);
    assert.strictEqual(notification.bySeverity.info, 1);
  });

  it('empty findings produces no issues found default', () => {
    const tail = new AuthorTail();

    const notification = tail.prepare('test/project!42', 'APPROVE', []);

    assert.strictEqual(notification.findingsCount, 0);
    assert.strictEqual(notification.bySeverity.error, 0);
    assert.strictEqual(notification.bySeverity.warning, 0);
    assert.strictEqual(notification.bySeverity.info, 0);
    assert.strictEqual(notification.topFindings.length, 0);
    assert.ok(notification.proposedReplies.some((r) => r.includes('без действий')));
  });

  it('top findings are ordered by severity: error before warning before info', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', severity: 'info' }),
      createFinding({ id: 'F-2', severity: 'error' }),
      createFinding({ id: 'F-3', severity: 'warning' }),
      createFinding({ id: 'F-4', severity: 'error' }),
      createFinding({ id: 'F-5', severity: 'info' }),
      createFinding({ id: 'F-6', severity: 'warning' }),
    ];
    const tail = new AuthorTail();

    const notification = tail.prepare('test/project!42', 'REQUEST_CHANGES', findings);

    assert.strictEqual(notification.topFindings.length, 5);
    assert.strictEqual(notification.topFindings[0].severity, 'error');
    assert.strictEqual(notification.topFindings[1].severity, 'error');
    assert.strictEqual(notification.topFindings[2].severity, 'warning');
    assert.strictEqual(notification.topFindings[3].severity, 'warning');
    assert.strictEqual(notification.topFindings[4].severity, 'info');
  });

  it('dispute findings trigger proposed reply for operator decision', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', severity: 'warning', mark: 'dispute' }),
    ];
    const tail = new AuthorTail();

    const notification = tail.prepare('test/project!42', 'REQUEST_CHANGES', findings);

    assert.ok(notification.proposedReplies.some((r) => r.includes('Спорные')));
  });
});

describe('ReviewerTail', () => {
  it('findings are grouped by mark counts: consensus dispute unique', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', mark: 'consensus' }),
      createFinding({ id: 'F-2', mark: 'consensus' }),
      createFinding({ id: 'F-3', mark: 'dispute' }),
      createFinding({ id: 'F-4', mark: 'unique' }),
    ];
    const tail = new ReviewerTail();

    const summary = tail.prepare('test/project!42', findings);

    assert.strictEqual(summary.consensusCount, 2);
    assert.strictEqual(summary.disputeCount, 1);
    assert.strictEqual(summary.uniqueCount, 1);
    assert.strictEqual(summary.findingsCount, 4);
  });

  it('recommended verdict is REQUEST_CHANGES when errors present', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', severity: 'error', mark: 'consensus' }),
    ];
    const tail = new ReviewerTail();

    const summary = tail.prepare('test/project!42', findings);

    assert.strictEqual(summary.recommendedVerdict, 'REQUEST_CHANGES');
  });

  it('recommended verdict is APPROVE when no findings exist', () => {
    const tail = new ReviewerTail();

    const summary = tail.prepare('test/project!42', []);

    assert.strictEqual(summary.recommendedVerdict, 'APPROVE');
    assert.strictEqual(summary.postingCandidates.length, 0);
  });

  it('existing thread on same file line deduplicates as reply action', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', file: 'src/a.ts', line: 10, mark: 'consensus' }),
      createFinding({ id: 'F-2', file: 'src/b.ts', line: 20, mark: 'consensus' }),
    ];
    const tail = new ReviewerTail();

    const summary = tail.prepare('test/project!42', findings, [
      { file: 'src/a.ts', line: 10, body: 'existing thread' },
    ]);

    const deduped = summary.postingCandidates.find((c) => c.file === 'src/a.ts');
    const fresh = summary.postingCandidates.find((c) => c.file === 'src/b.ts');
    assert.ok(deduped);
    assert.strictEqual(deduped.postingAction, 'reply');
    assert.ok(fresh);
    assert.strictEqual(fresh.postingAction, 'post_new');
  });

  it('disputed findings are skipped from posting candidates', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', file: 'src/a.ts', line: 10, mark: 'dispute' }),
      createFinding({ id: 'F-2', file: 'src/b.ts', line: 20, mark: 'consensus' }),
    ];
    const tail = new ReviewerTail();

    const summary = tail.prepare('test/project!42', findings);

    const dispute = summary.postingCandidates.find((c) => c.id === 'F-1');
    const consensus = summary.postingCandidates.find((c) => c.id === 'F-2');
    assert.ok(dispute);
    assert.strictEqual(dispute.postingAction, 'skip');
    assert.ok(consensus);
    assert.strictEqual(consensus.postingAction, 'post_new');
  });

  it('recommendations include dispute and consensus counts for reviewer', () => {
    const findings: FindingEntry[] = [
      createFinding({ id: 'F-1', mark: 'consensus', severity: 'warning' }),
      createFinding({ id: 'F-2', mark: 'dispute', severity: 'warning' }),
      createFinding({ id: 'F-3', mark: 'unique', severity: 'info' }),
    ];
    const tail = new ReviewerTail();

    const summary = tail.prepare('test/project!42', findings);

    assert.ok(summary.recommendations.some((r) => r.includes('спорных')));
    assert.ok(summary.recommendations.some((r) => r.includes('консенсус')));
    assert.ok(summary.recommendations.some((r) => r.includes('уникальных')));
  });
});
