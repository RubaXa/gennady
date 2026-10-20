// @file: Unit tests for MetricsCollector — accept-rate, edit-rate, time-to-decision, graduation gates
// @consumers: node:test runner
// @tasks: TSK-165

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsCollector, type DecisionMetrics } from '../metrics.ts';
import type { JournalPort, JournalEntry, SinceResult } from '../../inbox-core/event-journal.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';

const MR = 'group/project!42';

/** @purpose Deterministic clock: base ISO + offset seconds */
function t(offsetSec: number): string {
  return new Date(new Date('2026-08-07T00:00:00.000Z').getTime() + offsetSec * 1000).toISOString();
}

/**
 * @purpose In-memory JournalPort accepting pre-seeded entries.
 * @invariant Entries are returned as-is from read(); seq auto-assigned on append.
 */
function inMemoryJournal(entries: JournalEntry[]): JournalPort & { _entries: JournalEntry[] } {
  return {
    _entries: entries,
    read() {
      return this._entries;
    },
    since(_cursor: number): SinceResult {
      const all = this._entries;
      return { entries: all, nextCursor: all.length > 0 ? all[all.length - 1].seq : 0 };
    },
    async append(entry: Omit<JournalEntry, 'seq'>) {
      const seq = this._entries.length + 1;
      this._entries.push({ ...entry, seq } as JournalEntry);
      return seq;
    },
  };
}

describe('MetricsCollector', () => {
  // #region START_METRICS_ACCEPT_RATE
  it('accept rate computed with sample size per capability', () => {
    // contract: 22 accept + 3 edit = 25 decisions for react → acceptRate=0.88, editRate=0.12
    // failure mode: NaN rate on zero decisions; rounding must preserve precision to 2 decimal places
    const entries: JournalEntry[] = [];
    for (let i = 0; i < 25; i++) {
      const pId = `prop-${i + 1}`;
      entries.push({
        seq: i * 2 + 1,
        mr: MR,
        ts: t(i * 10),
        kind: 'proposal',
        actor: 'queue',
        payload: { proposalId: pId, capability: 'react' },
      });
      const verdict = i < 22 ? 'accept' : 'edit';
      entries.push({
        seq: i * 2 + 2,
        mr: MR,
        ts: t(i * 10 + 5),
        kind: 'decision',
        actor: 'operator',
        payload: { proposalId: pId, verdict },
      });
    }
    const journal = inMemoryJournal(entries);
    const dj = new DecisionJournal(journal);
    const collector = new MetricsCollector(journal, dj);

    const metrics = collector.computeAll();

    const reactAccept = metrics.acceptRate['react'];
    assert.deepStrictEqual(reactAccept, { rate: 0.88, n: 25 }, 'acceptRate.react mismatch');

    const reactEdit = metrics.editRate['react'];
    assert.deepStrictEqual(reactEdit, { rate: 0.12, n: 25 }, 'editRate.react mismatch');
  });
  // #endregion END_METRICS_ACCEPT_RATE

  // #region START_METRICS_TIME_TO_DECISION
  it('time to decision median and p90', () => {
    // contract: known proposal→decision deltas: 5×10s, 2×100s, 1×200s, 1×500s, 1×1000s — median around 55, p90 around 500
    // failure mode: NaN when no completed pairs; wrong time unit (must be seconds, not ms)
    const deltas = [10, 10, 10, 10, 10, 100, 100, 200, 500, 1000];
    const entries: JournalEntry[] = [];
    let seq = 0;
    for (const [i, delta] of deltas.entries()) {
      const pId = `prop-t-${i + 1}`;
      const propTs = t(i * 20);
      entries.push({
        seq: ++seq,
        mr: MR,
        ts: propTs,
        kind: 'proposal',
        actor: 'queue',
        payload: { proposalId: pId, capability: 'react' },
      });
      entries.push({
        seq: ++seq,
        mr: MR,
        ts: t(i * 20 + delta),
        kind: 'decision',
        actor: 'operator',
        payload: { proposalId: pId, verdict: 'accept' },
      });
    }

    const journal = inMemoryJournal(entries);
    const dj = new DecisionJournal(journal);
    const collector = new MetricsCollector(journal, dj);

    const metrics = collector.computeAll();

    const { median, p90 } = metrics.timeToDecisionSec;
    assert.strictEqual(median, 55, 'median mismatch');
    assert.strictEqual(p90, 500, 'p90 mismatch');
  });
  // #endregion END_METRICS_TIME_TO_DECISION

  // #region START_METRICS_GRADUATION_BLOCKED
  it('graduation is blocked below sample size', () => {
    // contract: acceptRate ≥ 0.9 (11/12) but n=12 < 20 → capability stays proposal
    // failure mode: graduated=true when n below GRADUATION_MIN_N
    const entries: JournalEntry[] = [];
    for (let i = 0; i < 12; i++) {
      const pId = `prop-g-${i + 1}`;
      entries.push({
        seq: i * 2 + 1,
        mr: MR,
        ts: t(i * 10),
        kind: 'proposal',
        actor: 'queue',
        payload: { proposalId: pId, capability: 'react' },
      });
      const verdict = i < 11 ? 'accept' : 'edit';
      entries.push({
        seq: i * 2 + 2,
        mr: MR,
        ts: t(i * 10 + 5),
        kind: 'decision',
        actor: 'operator',
        payload: { proposalId: pId, verdict },
      });
    }

    const journal = inMemoryJournal(entries);
    const dj = new DecisionJournal(journal);
    const collector = new MetricsCollector(journal, dj);

    const graduated = collector.isGraduated('react');
    assert.strictEqual(graduated, false, 'should NOT graduate when n < 20');

    const graduationMap = collector.computeGraduationMap();
    assert.strictEqual(
      graduationMap['react'],
      false,
      'graduationMap must show react as not graduated'
    );
  });
  // #endregion END_METRICS_GRADUATION_BLOCKED

  // #region START_METRICS_EMPTY_JOURNAL
  it('empty journal yields zero metrics', () => {
    // contract: no proposals → all rates NaN, n=0; sample sizes preserved as zero
    // failure mode: non-NaN rates fabricated from empty data
    const journal = inMemoryJournal([]);
    const dj = new DecisionJournal(journal);
    const collector = new MetricsCollector(journal, dj);

    const metrics = collector.computeAll();

    assert.strictEqual(Object.keys(metrics.acceptRate).length, 0, 'acceptRate must be empty');
    assert.strictEqual(Object.keys(metrics.editRate).length, 0, 'editRate must be empty');
    assert.ok(Number.isNaN(metrics.timeToDecisionSec.median), 'median must be NaN');
    assert.ok(Number.isNaN(metrics.timeToDecisionSec.p90), 'p90 must be NaN');
  });
  // #endregion END_METRICS_EMPTY_JOURNAL
});
