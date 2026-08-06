// @file: DecisionJournal — proposal/decision recording atop EventJournal, capability accept-rate computation, dry-run suppression logging
// @consumers: inbox-queue, inbox-api, inbox-eval
// @tasks: TSK-157

import type { JournalPort } from './event-journal.ts';
import { logger } from '#logger';

/** @purpose Closed set of 6 capabilities for graduated autonomy (D-302 / §2.1). */
export type Capability =
  | 'post_findings'
  | 'post_reply'
  | 'react'
  | 'resolve'
  | 'approve'
  | 'update_description';

/** @purpose Operator verdict on a machine proposal. */
export type Verdict = 'accept' | 'edit' | 'reject';

/** @purpose Metadata about the producing agent/session. */
export type ProduceMeta = {
  /** @purpose Session identifier */
  sessionId: string;
  /** @purpose Optional task reference */
  taskId?: string;
  /** @purpose Optional model identifier */
  model?: string;
};

/** @purpose Proposal envelope — machine proposes an action for a given capability on a given MR. */
export type ProposalRecord = {
  /** @purpose Unique proposal identifier */
  proposalId: string;
  /** @purpose Target capability */
  capability: Capability;
  /** @purpose MR ref (path!iid) */
  mr: string;
  /** @purpose Capability-specific payload (findings, reply text, etc.) */
  payload: Record<string, unknown>;
  /** @purpose Producing agent metadata */
  producedBy: ProduceMeta;
};

/** @purpose Decision envelope — operator response to a machine proposal. */
export type DecisionRecord = {
  /** @purpose References the proposal being decided */
  proposalId: string;
  /** @purpose Operator verdict */
  verdict: Verdict;
  /** @purpose Diff applied by operator when verdict=edit */
  diff?: string;
  /** @purpose Operator identifier */
  actor: string;
};

/** @purpose Acceptance metrics for a single capability over a rolling window. */
export type AcceptRate = {
  /** @purpose Target capability */
  capability: Capability;
  /** @purpose Number of accepted decisions in the window */
  acceptCount: number;
  /** @purpose Total decisions in the window */
  totalDecisions: number;
  /** @purpose Accept ratio 0–1 | @invariant NaN when totalDecisions=0 */
  rate: number;
};

/**
 * @purpose Recording layer for proposals and decisions atop the EventJournal, plus accept-rate analytics.
 * @invariant writeProposal / writeDecision / recordDryRunSuppression each append one journal entry with O_APPEND+fsync.
 * @invariant accept-rate computation is a pure function over the journal — no in-memory cache.
 */
export class DecisionJournal {
  /** @purpose Underlying event journal for persistence. */
  protected _journal: JournalPort;

  /**
   * @purpose Create a DecisionJournal backed by the given event journal.
   * @param journal JournalPort implementation (typically EventJournal).
   */
  constructor(journal: JournalPort) {
    this._journal = journal;
  }

  /**
   * @purpose Record a machine proposal as a `proposal` event in the journal.
   * @param record Proposal data.
   * @throws When the underlying journal write fails.
   * @returns Assigned seq after fsync.
   * @sideEffect Appends one JSON line to the journal file.
   */
  writeProposal(record: ProposalRecord): Promise<number> {
    logger.debug('[DecisionJournal#writeProposal] [idle → writing]', {
      proposalId: record.proposalId,
      capability: record.capability,
      mr: record.mr,
    });

    // #region START_WRITE_PROPOSAL_EVENT
    // invariant: kind='proposal'; capability + payload stored as envelope fields for queryability
    return this._journal.append({
      ts: new Date().toISOString(),
      mr: record.mr,
      kind: 'proposal',
      actor: 'queue',
      payload: {
        proposalId: record.proposalId,
        capability: record.capability,
        payload: record.payload,
        producedBy: record.producedBy,
      },
    });
    // #endregion END_WRITE_PROPOSAL_EVENT
  }

  /**
   * @purpose Record an operator decision as a `decision` event in the journal.
   * @param record Decision data.
   * @throws When the underlying journal write fails.
   * @returns Assigned seq after fsync.
   * @sideEffect Appends one JSON line to the journal file.
   */
  writeDecision(record: DecisionRecord): Promise<number> {
    logger.debug('[DecisionJournal#writeDecision] [idle → writing]', {
      proposalId: record.proposalId,
      verdict: record.verdict,
      actor: record.actor,
    });

    // #region START_WRITE_DECISION_EVENT
    return this._journal.append({
      ts: new Date().toISOString(),
      mr: '',
      kind: 'decision',
      actor: record.actor,
      payload: {
        proposalId: record.proposalId,
        verdict: record.verdict,
        diff: record.diff,
        actor: record.actor,
      },
    });
    // #endregion END_WRITE_DECISION_EVENT
  }

  /**
   * @purpose Record a suppressed effect when dry-run prevents external writes.
   * @param mr MR ref affected.
   * @param effectId Unique effect identifier.
   * @returns Assigned seq after fsync.
   * @sideEffect Appends a system/dryrun event to the journal.
   */
  recordDryRunSuppression(mr: string, effectId: string): Promise<number> {
    logger.debug('[DecisionJournal#recordDryRunSuppression] [idle → writing]', { mr, effectId });

    // #region START_WRITE_DRYRUN_SUPPRESSION
    return this._journal.append({
      ts: new Date().toISOString(),
      mr,
      kind: 'system',
      actor: 'core',
      payload: {
        event: 'dryrun',
        effectId,
      },
    });
    // #endregion END_WRITE_DRYRUN_SUPPRESSION
  }

  /**
   * @purpose Compute acceptance rate for a single capability over the last N decisions.
   * @param capability Target capability.
   * @param [windowSize] Rolling window size for the decision sample.
   * @returns AcceptRate with counts and ratio.
   */
  computeAcceptRate(capability: Capability, windowSize: number = 20): AcceptRate {
    // #region START_COMPUTE_SINGLE_ACCEPT_RATE
    const proposals = this._mapProposals();
    const decisions = this._readDecisions();

    const relevant = decisions.filter((d) => proposals.get(d.proposalId) === capability);

    const window = relevant.slice(-windowSize);
    const acceptCount = window.filter((d) => d.verdict === 'accept').length;
    const total = window.length;
    const rate = total > 0 ? acceptCount / total : Number.NaN;

    return { capability, acceptCount, totalDecisions: total, rate };
    // #endregion END_COMPUTE_SINGLE_ACCEPT_RATE
  }

  /**
   * @purpose Compute acceptance rates for all 6 capabilities.
   * @param [windowSize] Rolling window size per capability.
   * @returns One AcceptRate entry per capability.
   */
  computeAllAcceptRates(windowSize: number = 20): AcceptRate[] {
    const capabilities: Capability[] = [
      'post_findings',
      'post_reply',
      'react',
      'resolve',
      'approve',
      'update_description',
    ];
    return capabilities.map((cap) => this.computeAcceptRate(cap, windowSize));
  }

  /**
   * @purpose Build a proposalId → capability map from all proposal events.
   * @returns Map from proposalId to its capability.
   */
  protected _mapProposals(): Map<string, Capability> {
    // #region START_MAP_PROPOSALS
    // invariant: dedup by proposalId — last occurrence wins (idempotent for same id)
    const entries = this._journal.read();
    const map = new Map<string, Capability>();
    for (const e of entries) {
      if (e.kind !== 'proposal') continue;
      const proposalId = (e.payload as Record<string, unknown>)?.proposalId as string | undefined;
      const capability = (e.payload as Record<string, unknown>)?.capability as
        | Capability
        | undefined;
      if (proposalId && capability) {
        map.set(proposalId, capability);
      }
    }
    return map;
    // #endregion END_MAP_PROPOSALS
  }

  /**
   * @purpose Extract all decision records from the journal.
   * @returns Flat list of decision payloads from decision-kind entries.
   */
  protected _readDecisions(): Array<{ proposalId: string; verdict: Verdict }> {
    // #region START_READ_DECISIONS
    const entries = this._journal.read();
    const results: Array<{ proposalId: string; verdict: Verdict }> = [];
    for (const e of entries) {
      if (e.kind !== 'decision') continue;
      const p = e.payload as Record<string, unknown> | undefined;
      const proposalId = p?.proposalId as string | undefined;
      const verdict = p?.verdict as Verdict | undefined;
      if (proposalId && verdict) {
        results.push({ proposalId, verdict });
      }
    }
    return results;
    // #endregion END_READ_DECISIONS
  }
}
