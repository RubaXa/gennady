// @file: Opt-in, cause-scoped comparison of externally observed progress facts.
// @spec: AI-SKILLS
// @consumers: EA-3 evidence analysis; deterministic progress controls

import { createHash } from 'node:crypto';
import type { SddEvalObservation } from './types.ts';

/** @purpose Host-owned relevance boundary; never infer it from the evaluated worker's prose. */
export type MeaningfulProgressScope = {
  /** @purpose Stable host-selected cause under comparison, not an attempt or call identifier. */
  causeId: string;
  /** @purpose Exact diagnostic commands relevant to this cause. */
  diagnosticCommands: readonly string[];
  /** @purpose Exact host-owned artifact paths whose state can inform this cause. */
  artifactPaths: readonly string[];
  /** @purpose Exact journal paths excluded even when also listed as artifacts. */
  journalPaths: readonly string[];
};

/** @purpose Complete host evidence for one comparison point, separate from bounded-tail liveness. */
export type MeaningfulProgressEvidence = {
  /** @purpose Bind the captured facts to the fixed comparison cause. */
  causeId: string;
  /** @purpose Host certifies the scoped capture/extraction is complete; observer tails do not imply this. */
  complete: boolean;
  /** @purpose Existing public observer projection; its liveness fingerprint is not a progress fact. */
  observation: Pick<SddEvalObservation, 'tail' | 'artifactFingerprint'>;
  /** @purpose Host-selected diagnostic excerpts, checked against actual terminal tool output. */
  diagnostics: readonly { messageId: string; callId: string; text: string }[];
  /** @purpose Host-read exact artifact hashes; null proves observed absence, never an unreadable file. */
  artifacts: readonly { path: string; sha256: string | null }[];
};

/** @purpose Evidence classification only: no retry permission, budget reset or claim of correctness. */
export type MeaningfulProgressResult = {
  /** @purpose Distinguish observed novelty, comparable repetition and insufficient evidence. */
  status: 'progress' | 'no-progress' | 'unknown';
  /** @purpose Hash-only diagnostic identities or configured artifact paths, never raw tool output. */
  newFacts: readonly { kind: 'diagnostic' | 'artifact'; key: string }[];
  /** @purpose Machine-readable reasons a comparison cannot establish progress or repetition. */
  issues: readonly string[];
};

const SHA256 = /^[a-f0-9]{64}$/;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** @purpose Discard common clock/request metadata, not arbitrary numbers or error details. */
function diagnosticSignal(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g, '<time>')
    .replace(/\b(?:call[_-]?id|request[_-]?id|run[_-]?id)\s*[:=]\s*[A-Za-z0-9._-]+/gi, '<request>')
    .replace(/\s+/g, ' ')
    .trim();
}

function facts(scope: MeaningfulProgressScope, evidence: MeaningfulProgressEvidence) {
  const diagnostics = new Set<string>();
  const artifacts = new Map<string, string | null>();
  const issues: string[] = [];
  const commands = new Set(scope.diagnosticCommands);
  const journal = new Set(scope.journalPaths);
  const paths = new Set(scope.artifactPaths.filter((path) => !journal.has(path)));
  for (const item of evidence.artifacts) {
    if (!paths.has(item.path)) continue;
    if (artifacts.has(item.path) || (item.sha256 !== null && !SHA256.test(item.sha256))) {
      issues.push('ambiguous-or-invalid-artifact-snapshot');
      continue;
    }
    artifacts.set(item.path, item.sha256);
  }
  for (const path of paths) {
    if (!artifacts.has(path)) issues.push('missing-scoped-artifact-snapshot');
  }
  for (const fact of evidence.diagnostics) {
    const calls = evidence.observation.tail
      .filter((entry) => entry.messageId === fact.messageId)
      .flatMap((entry) => entry.toolCalls.filter((call) => call.callId === fact.callId));
    const call = calls[0];
    const output = call?.observation?.output;
    if (
      calls.length !== 1 ||
      !call ||
      !fact.text.trim() ||
      call.tool !== 'bash' ||
      !commands.has(call.command ?? '') ||
      !['completed', 'error'].includes(call.status) ||
      call.inputSummaryTruncated ||
      output?.available !== true ||
      output.prefixComplete !== true ||
      !SHA256.test(output.redactedPrefixSha256 ?? '') ||
      !(call.diagnostic ?? '').includes(fact.text)
    ) {
      issues.push('diagnostic-fact-not-grounded-in-complete-tool-output');
      continue;
    }
    const signal = diagnosticSignal(fact.text);
    if (!signal.replace(/<time>|<request>|[\s\[\]:,;-]/g, '')) {
      issues.push('diagnostic-contains-only-request-metadata');
      continue;
    }
    diagnostics.add(digest(JSON.stringify([call.command, signal])));
  }
  for (const entry of evidence.observation.tail) {
    for (const call of entry.toolCalls) {
      if (!commands.has(call.command ?? '')) continue;
      if (
        !['completed', 'error'].includes(call.status) ||
        (call.status === 'completed' && !Number.isSafeInteger(call.exitCode)) ||
        ((call.status === 'error' || (call.exitCode !== undefined && call.exitCode !== 0)) &&
          !evidence.diagnostics.some(
            (fact) => fact.messageId === entry.messageId && fact.callId === call.callId
          ))
      ) {
        issues.push('missing-scoped-diagnostic-fact');
      }
    }
  }
  return { diagnostics, artifacts, issues };
}

/**
 * @purpose Compare host-selected observable facts without changing observer or runtime retry policy.
 * @invariant Metadata and liveness fingerprints never prove progress. Host scope, snapshots and stable excerpt selection remain trusted; normalization does not establish semantic equivalence.
 * @param scope Trusted, fixed cause/relevance configuration owned by the evaluation case.
 * @param previous Previous complete scoped evidence; absence cannot prove novelty.
 * @param current Current complete scoped evidence, including host artifact snapshots.
 * @returns New observed facts, repetition, or explicit unknown; novelty is not proof of a fix.
 */
export function classifyMeaningfulProgress(
  scope: MeaningfulProgressScope,
  previous: MeaningfulProgressEvidence | undefined,
  current: MeaningfulProgressEvidence
): MeaningfulProgressResult {
  if (
    !previous ||
    !scope.causeId.trim() ||
    previous.causeId !== scope.causeId ||
    current.causeId !== scope.causeId ||
    !previous.complete ||
    !current.complete
  ) {
    return {
      status: 'unknown',
      newFacts: [],
      issues: ['missing-or-incomparable-complete-evidence'],
    };
  }
  const before = facts(scope, previous);
  const after = facts(scope, current);
  const issues = [...new Set([...before.issues, ...after.issues])];
  if (issues.length) return { status: 'unknown', newFacts: [], issues };
  if (!before.diagnostics.size && !after.diagnostics.size && !before.artifacts.size) {
    return { status: 'unknown', newFacts: [], issues: ['no-scoped-observable-facts'] };
  }
  const newFacts: Array<{ kind: 'diagnostic' | 'artifact'; key: string }> = [];
  for (const key of after.diagnostics) {
    if (!before.diagnostics.has(key)) newFacts.push({ kind: 'diagnostic', key });
  }
  for (const [path, hash] of after.artifacts) {
    if (before.artifacts.get(path) !== hash) newFacts.push({ kind: 'artifact', key: path });
  }
  if (!newFacts.length && [...before.diagnostics].some((key) => !after.diagnostics.has(key))) {
    return { status: 'unknown', newFacts: [], issues: ['diagnostic-disappeared-without-new-fact'] };
  }
  return { status: newFacts.length ? 'progress' : 'no-progress', newFacts, issues: [] };
}
