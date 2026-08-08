// @file: MetricsCollector — computes accept-rate, edit-rate, time-to-decision from the decision journal dataset (D-302)
// @consumers: EvalHarness (TSK-165)
// @tasks: TSK-165

import { logger } from '#logger';
import type { JournalPort, JournalEntry } from '../inbox-core/event-journal.ts';
import { DecisionJournal, type Capability, type Verdict } from '../inbox-core/decision-journal.ts';

/** @purpose Per-capability metric: rate and sample size */
export type CapabilityMetrics = {
  /** @purpose Acceptance rate 0–1 | @invariant NaN when n=0 */
  rate: number;
  /** @purpose Sample size (number of decisions) */
  n: number;
};

/** @purpose Aggregated metrics across all capabilities per §3 spec */
export type DecisionMetrics = {
  /** @purpose Accept rate per capability: accept decisions / total decisions */
  acceptRate: Record<string, CapabilityMetrics>;
  /** @purpose Edit rate per capability: edit-verdict decisions / total decisions */
  editRate: Record<string, CapabilityMetrics>;
  /** @purpose Time from proposal to operator decision | @invariant seconds (not ms) */
  timeToDecisionSec: { median: number; p90: number };
};

/** @purpose Minimum sample size for capability graduation per D-302 */
const GRADUATION_MIN_N = 20;

/** @purpose Build a proposalId → { capability, ts, mr } map from raw journal entries */
function _indexProposals(
  entries: JournalEntry[]
): Map<string, { capability: Capability; ts: string }> {
  const map = new Map<string, { capability: Capability; ts: string }>();
  for (const e of entries) {
    if (e.kind !== 'proposal') continue;
    const p = e.payload as Record<string, unknown> | undefined;
    const proposalId = p?.proposalId as string | undefined;
    const capability = p?.capability as Capability | undefined;
    if (proposalId && capability && e.ts) {
      map.set(proposalId, { capability, ts: e.ts });
    }
  }
  return map;
}

/** @purpose Extract all decision records with verdict, diff, and ts from raw journal entries */
function _collectDecisions(
  entries: JournalEntry[]
): Array<{ proposalId: string; verdict: Verdict; diff?: string; ts: string }> {
  const results: Array<{ proposalId: string; verdict: Verdict; diff?: string; ts: string }> = [];
  for (const e of entries) {
    if (e.kind !== 'decision') continue;
    const p = e.payload as Record<string, unknown> | undefined;
    const proposalId = p?.proposalId as string | undefined;
    const verdict = p?.verdict as Verdict | undefined;
    if (proposalId && verdict && e.ts) {
      results.push({ proposalId, verdict, diff: p?.diff as string | undefined, ts: e.ts });
    }
  }
  return results;
}

/**
 * @purpose Compute median from a sorted numeric array
 * @param sorted Pre-sorted array of numbers
 * @returns Median value; NaN for empty input
 */
function _median(sorted: number[]): number {
  if (sorted.length === 0) return Number.NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @purpose Compute p90 from a sorted numeric array
 * @param sorted Pre-sorted array of numbers
 * @returns p90 value; NaN for empty input
 */
function _p90(sorted: number[]): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.ceil(sorted.length * 0.9) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * @purpose Compute elapsed seconds between two ISO timestamps
 * @param start ISO 8601 timestamp
 * @param end ISO 8601 timestamp
 * @returns Elapsed seconds
 */
function _elapsedSec(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000;
}

/**
 * @purpose Reads the decision journal (D-302 dataset) and computes per-capability metrics: accept-rate, edit-rate, time-to-decision.
 * @invariant acceptRate.rate and editRate.rate are NaN when n=0 for a capability.
 * @invariant timeToDecisionSec computed only from completed proposal→decision pairs (both timestamps present).
 */
export class MetricsCollector {
  /** @purpose Underlying event journal for raw entry access */
  protected _journal: JournalPort;
  /** @purpose Decision journal for pre-computed accept rates and capability set */
  protected _decisionJournal: DecisionJournal;

  /**
   * @purpose Create a collector backed by the given journals
   * @param journal Raw event journal for timestamp and verdict access
   * @param decisionJournal Decision journal for accept-rate computation
   */
  constructor(journal: JournalPort, decisionJournal: DecisionJournal) {
    this._journal = journal;
    this._decisionJournal = decisionJournal;
  }

  /**
   * @purpose Compute all metrics from the journal: acceptRate, editRate, timeToDecisionSec
   * @returns Full DecisionMetrics snapshot
   */
  computeAll(): DecisionMetrics {
    // #region START_COMPUTE_ALL — invariant: all three metric groups computed in one pass over raw entries
    const entries = this._journal.read();
    const proposals = _indexProposals(entries);
    const decisions = _collectDecisions(entries);

    const capabilities = Array.from(new Set([...proposals.values()].map((p) => p.capability)));

    const acceptRate: Record<string, CapabilityMetrics> = {};
    const editRate: Record<string, CapabilityMetrics> = {};
    const decisionDeltas: number[] = [];

    for (const cap of capabilities) {
      const capDecisions = decisions.filter((d) => proposals.get(d.proposalId)?.capability === cap);
      const n = capDecisions.length;

      const acceptCount = capDecisions.filter((d) => d.verdict === 'accept').length;
      acceptRate[cap] = { rate: n > 0 ? acceptCount / n : Number.NaN, n };

      const editCount = capDecisions.filter((d) => d.verdict === 'edit').length;
      editRate[cap] = { rate: n > 0 ? editCount / n : Number.NaN, n };

      for (const d of capDecisions) {
        const prop = proposals.get(d.proposalId);
        if (prop) {
          decisionDeltas.push(_elapsedSec(prop.ts, d.ts));
        }
      }
    }

    const sorted = decisionDeltas.sort((a, b) => a - b);
    // #endregion END_COMPUTE_ALL

    return {
      acceptRate,
      editRate,
      timeToDecisionSec: {
        median: _median(sorted),
        p90: _p90(sorted),
      },
    };
  }

  /**
   * @purpose Check whether a capability qualifies for auto-graduation per D-302 thresholds
   * @param capability Target capability
   * @param [windowSize] Rolling window for decisions
   * @returns True when accept rate ≥ 90% and n ≥ 20
   */
  isGraduated(capability: Capability, windowSize: number = 20): boolean {
    // #region START_GRADUATION_CHECK — invariant: both rate and sample size must meet thresholds (D-302)
    const rate = this._decisionJournal.computeAcceptRate(capability, windowSize);
    const meetsRate = rate.rate >= 0.9;
    const meetsSample = rate.totalDecisions >= GRADUATION_MIN_N;
    logger.debug('[MetricsCollector#isGraduated] [idle → checked]', {
      capability,
      rate: rate.rate,
      n: rate.totalDecisions,
      meetsRate,
      meetsSample,
    });
    return meetsRate && meetsSample;
    // #endregion END_GRADUATION_CHECK
  }

  /**
   * @purpose Compute graduation status for all 6 capabilities
   * @param [windowSize] Rolling window per capability
   * @returns Map from capability to graduated flag
   */
  computeGraduationMap(windowSize: number = 20): Record<Capability, boolean> {
    const all: Capability[] = [
      'post_findings',
      'post_reply',
      'react',
      'resolve',
      'approve',
      'update_description',
    ];
    const result = {} as Record<Capability, boolean>;
    for (const cap of all) {
      result[cap] = this.isGraduated(cap, windowSize);
    }
    return result;
  }
}
