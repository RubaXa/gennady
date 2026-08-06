// @file: Unit tests for DecisionJournal and CapabilityModes — proposal/decision journaling, accept-rate per capability, dry-run suppression trail, graduation thresholds
// @consumers: node:test runner
// @tasks: TSK-157

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DecisionJournal,
  type ProposalRecord,
  type DecisionRecord,
  type AcceptRate,
} from '../decision-journal.ts';
import { CapabilityModes } from '../capability-modes.ts';
import type { JournalPort, JournalEntry, SinceResult } from '../event-journal.ts';

type MockJournalCtx = { entries: JournalEntry[]; nextSeq: number };

function createDecisionJournalContext() {
  const ctx: MockJournalCtx = { entries: [], nextSeq: 1 };
  const journal: JournalPort = {
    async append(entry: Omit<JournalEntry, 'seq'>): Promise<number> {
      const seq = ctx.nextSeq++;
      ctx.entries.push({ ...(entry as JournalEntry), seq });
      return seq;
    },
    read(): JournalEntry[] {
      return [...ctx.entries];
    },
    since(cursor: number): SinceResult {
      const entries = ctx.entries.filter((e) => e.seq > cursor);
      return {
        entries,
        nextCursor: entries.length > 0 ? entries[entries.length - 1].seq : cursor,
      };
    },
  };
  const decisionJournal = new DecisionJournal(journal);
  return { journal, ctx, decisionJournal };
}

function makeProposal(overrides?: Partial<ProposalRecord>): ProposalRecord {
  return {
    proposalId: 'p-001',
    capability: 'react',
    mr: 'g/project!42',
    payload: { findings: ['F-1'] },
    producedBy: { sessionId: 's-1' },
    ...overrides,
  };
}

function makeDecision(overrides?: Partial<DecisionRecord>): DecisionRecord {
  return {
    proposalId: 'p-001',
    verdict: 'accept',
    actor: 'operator',
    ...overrides,
  };
}

describe('DecisionJournal', () => {
  it('contract: proposal and decision envelope', () => {
    // contract: ProposalRecord and DecisionRecord shapes match D-302 spec
    // failure mode: capability must be one of 6 closed-set values; verdict ∈ accept|edit|reject

    const proposal: ProposalRecord = {
      proposalId: 'p-881',
      capability: 'post_findings',
      mr: 'g/project!42',
      payload: { findings: ['F-1', 'F-2'] },
      producedBy: { sessionId: 's-1', taskId: '#11', model: 'gpt-4' },
    };
    assert.strictEqual(proposal.capability, 'post_findings');
    assert.strictEqual(proposal.producedBy.sessionId, 's-1');

    const decision: DecisionRecord = {
      proposalId: 'p-881',
      verdict: 'edit',
      diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-foo\n+bar',
      actor: 'operator',
    };
    assert.strictEqual(decision.verdict, 'edit');
    assert.strictEqual(typeof decision.diff, 'string');

    const rate: AcceptRate = {
      capability: 'react',
      acceptCount: 18,
      totalDecisions: 20,
      rate: 0.9,
    };
    assert.strictEqual(rate.rate, 0.9);
  });

  it('proposal and decision are journaled and rated per capability', async () => {
    // contract: writeProposal + writeDecision → both readable; computeAcceptRate per capability
    // invariant: accept-rate is computed over last N decisions for the given capability
    // failure mode: mr-less decisions (mr='') must still be linked to proposals via proposalId

    const { decisionJournal, ctx } = createDecisionJournalContext();

    // #region START_JOURNAL_PROPOSAL_AND_DECISION_SETUP
    const p1 = makeProposal({ proposalId: 'p-1', capability: 'react', mr: 'g/project!42' });
    const p2 = makeProposal({ proposalId: 'p-2', capability: 'approve', mr: 'g/project!99' });

    await decisionJournal.writeProposal(p1);
    await decisionJournal.writeProposal(p2);
    await decisionJournal.writeDecision(makeDecision({ proposalId: 'p-1', verdict: 'accept' }));
    await decisionJournal.writeDecision(makeDecision({ proposalId: 'p-2', verdict: 'reject' }));
    // #endregion END_JOURNAL_PROPOSAL_AND_DECISION_SETUP

    assert.strictEqual(ctx.entries.length, 4);

    const reactRate = decisionJournal.computeAcceptRate('react', 20);
    assert.strictEqual(reactRate.acceptCount, 1);
    assert.strictEqual(reactRate.totalDecisions, 1);

    const approveRate = decisionJournal.computeAcceptRate('approve', 20);
    assert.strictEqual(approveRate.acceptCount, 0);
    assert.strictEqual(approveRate.totalDecisions, 1);

    // #region START_ACCEPT_RATE_COMPUTATION_ASSERT
    const allRates = decisionJournal.computeAllAcceptRates(20);
    assert.strictEqual(allRates.length, 6);

    const reactEntry = allRates.find((r) => r.capability === 'react')!;
    assert.strictEqual(reactEntry.acceptCount, 1);
    assert.strictEqual(reactEntry.totalDecisions, 1);

    const emptyRate = allRates.find((r) => r.capability === 'post_findings')!;
    assert.strictEqual(emptyRate.totalDecisions, 0);
    assert.ok(Number.isNaN(emptyRate.rate));
    // #endregion END_ACCEPT_RATE_COMPUTATION_ASSERT
  });

  describe('CapabilityModes#evaluateGraduation', () => {
    it('remains proposal at n=19 even at 100% accept rate', () => {
      // contract: n < minSampleSize (20) → always proposal regardless of rate

      const rate: AcceptRate = {
        capability: 'react',
        acceptCount: 19,
        totalDecisions: 19,
        rate: 1.0,
      };
      const mode = CapabilityModes.evaluateGraduation(rate);
      assert.strictEqual(mode, 'proposal');
    });

    it('graduates to auto at n=20 with 100% accept rate', () => {
      // contract: n >= minSampleSize AND rate >= threshold (0.9) → auto

      const rate: AcceptRate = {
        capability: 'react',
        acceptCount: 20,
        totalDecisions: 20,
        rate: 1.0,
      };
      const mode = CapabilityModes.evaluateGraduation(rate);
      assert.strictEqual(mode, 'auto');
    });

    it('graduates to auto at 18 accept + 2 reject (90% of 20)', () => {
      // contract: rate >= threshold=0.9 → auto; 18/20 = 0.9 exactly → auto

      const rate: AcceptRate = {
        capability: 'react',
        acceptCount: 18,
        totalDecisions: 20,
        rate: 0.9,
      };
      const mode = CapabilityModes.evaluateGraduation(rate);
      assert.strictEqual(mode, 'auto');
    });

    it('remains proposal at 17 accept + 3 reject (85% of 20)', () => {
      // contract: rate < threshold=0.9 → proposal

      const rate: AcceptRate = {
        capability: 'react',
        acceptCount: 17,
        totalDecisions: 20,
        rate: 0.85,
      };
      const mode = CapabilityModes.evaluateGraduation(rate);
      assert.strictEqual(mode, 'proposal');
    });

    it('remains proposal when rate is NaN (zero decisions)', () => {
      // invariant: NaN rate → proposal (no decision data)

      const rate: AcceptRate = {
        capability: 'react',
        acceptCount: 0,
        totalDecisions: 0,
        rate: Number.NaN,
      };
      const mode = CapabilityModes.evaluateGraduation(rate);
      assert.strictEqual(mode, 'proposal');
    });
  });

  it('dry run suppresses all effects with journal trail', async () => {
    // contract: recordDryRunSuppression writes kind=system, payload.event=dryrun
    // invariant: no network call — append to journal only

    const { decisionJournal, ctx } = createDecisionJournalContext();

    const seq = await decisionJournal.recordDryRunSuppression(
      'g/project!42',
      'effect-post-findings'
    );

    assert.strictEqual(seq, 1);
    assert.strictEqual(ctx.entries.length, 1);

    const entry = ctx.entries[0];
    assert.strictEqual(entry.kind, 'system');
    assert.strictEqual(entry.mr, 'g/project!42');
    assert.strictEqual(entry.actor, 'core');

    // #region START_DRYRUN_TRAIL_ASSERT
    const payload = entry.payload as Record<string, unknown>;
    assert.strictEqual(payload.event, 'dryrun');
    assert.strictEqual(payload.effectId, 'effect-post-findings');
    // #endregion END_DRYRUN_TRAIL_ASSERT
  });
});
