// @file: SV-24 (D-135) closed-trigger-list escalation gate — decides whether a review pass must escalate to the operator.
// @consumers: role-instance.ts
// @tasks: N/A

import type { ThreadDecision } from '../thread-signal-classifier.ts';
import type { Discussion } from '../../inbox-core/vcs-inbox.port.ts';

/**
 * @purpose SV-24 closed trigger list (D-135) — nothing outside these four ever escalates to the operator.
 */
export type EscalationTrigger =
  | 'new_findings'
  | 'dispute'
  | 'error_severity'
  | 'ambiguous_classification';

/**
 * @purpose Aggregated review-outcome facts `shouldEscalateToOperator` needs, decoupled from the raw
 *   synth/triage artifact shapes so the gate stays a pure function over primitives.
 * @invariant `findings` reuses `_extractFindings()`'s shape — no second finding-extraction path.
 */
export type ReviewOutcome = {
  /** @purpose Findings from this pass's synthesis (full or delta review) | @invariant Empty on a pure thread-triage pass (no synthesis ran this pass) */
  findings: ReadonlyArray<{ severity: string }>;
  /** @purpose Count of open threads the triage session itself could not classify unambiguously (SV-24 trigger 4) */
  ambiguousThreadCount: number;
};

/**
 * @purpose One open thread's SV-22 decision, paired with its origin thread — lets a dispute be
 *   materialized into a summary without re-deriving it.
 */
export type ThreadEscalationSignal = {
  /** @purpose SV-22 decision for this thread */
  decision: ThreadDecision;
  /** @purpose Originating discussion | @invariant Read further only when `decision.kind === 'dispute'` */
  thread: Discussion;
  /** @purpose True when the triage session's own per-thread `status` reads as inconclusive (SV-24 trigger 4) */
  ambiguous: boolean;
};

/**
 * @purpose Result of the SV-24 closed-trigger-list gate: either nothing to escalate (SV-23
 *   auto-approve applies) or exactly one named trigger fired.
 */
export type EscalationVerdict =
  | { escalate: false }
  | { escalate: true; trigger: Exclude<EscalationTrigger, 'dispute'> }
  | { escalate: true; trigger: 'dispute'; disputedThread: Discussion };

/**
 * @purpose Operator-facing dispute summary (SV-24 trigger 2) — finding, author's argument, code
 *   context, and assistant recommendation, not just a disputed flag.
 */
export type DisputeSummary = {
  /** @purpose The original finding text (thread's first note) */
  finding: string;
  /** @purpose The MR author's disagreement argument (thread's last author note) */
  authorArgument: string;
  /** @purpose A few lines of code around the thread's location, when a worktree is available | @invariant Absent when the thread is file-less or the worktree can't be read */
  codeSnippet?: string;
  /** @purpose Assistant's suggested next step for the operator */
  recommendation: string;
};

/**
 * @purpose SV-24 (D-135) gate: decides whether a pass must escalate, against a closed list of 4
 *   triggers — replaces the old unconditional escalation.
 * @invariant Check order: dispute always wins (richest content); `error_severity` and
 *   `ambiguous_classification` follow; `new_findings` (weakest signal) is checked last.
 * @param reviewOutcome Findings + ambiguous-thread count from this pass.
 * @param threadSignals Per-thread SV-22 decisions from the same pass (empty on a pure synthesis pass).
 * @returns `{escalate:false}` when the closed trigger list is empty (SV-23 auto-approve applies),
 *   otherwise the fired trigger.
 */
export function shouldEscalateToOperator(
  reviewOutcome: ReviewOutcome,
  threadSignals: ThreadEscalationSignal[]
): EscalationVerdict {
  const dispute = threadSignals.find((signal) => signal.decision.kind === 'dispute');
  if (dispute) return { escalate: true, trigger: 'dispute', disputedThread: dispute.thread };

  if (reviewOutcome.findings.some((finding) => finding.severity === 'error')) {
    return { escalate: true, trigger: 'error_severity' };
  }

  if (reviewOutcome.ambiguousThreadCount > 0) {
    return { escalate: true, trigger: 'ambiguous_classification' };
  }

  if (reviewOutcome.findings.length > 0) {
    return { escalate: true, trigger: 'new_findings' };
  }

  return { escalate: false };
}
