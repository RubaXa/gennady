// @file: Comparable signatures for MR findings — delta primitive for repeated "Copy fix task" clicks.
// @consumers: inbox-api (copied_fix_task event, TSK-145)
// @tasks: TSK-144

import { createHash } from 'node:crypto';
import type { MrDetail } from '../inbox-api/types.ts';

/** @purpose Comparison-only fingerprint of one finding — location plus a truncated hash of its text, never the full message. */
export type FindingSignature = {
  /** @purpose Source file path the finding points at */
  file: string;
  /** @purpose Source line the finding points at */
  line: number;
  /** @purpose Truncated sha256 hex of the finding message | @invariant Comparison-only, not cryptographically strong */
  messageHash: string;
};

/** @purpose Outcome of comparing two signature sets across a copy-task delta. */
export type FindingSignatureDiff = {
  /** @purpose Present in current, absent in prev */
  added: FindingSignature[];
  /** @purpose Present in prev, absent in current */
  resolved: FindingSignature[];
  /** @purpose Present in both prev and current */
  unchanged: FindingSignature[];
};

/** @purpose Combines file:line and hash into the identity key used for set comparison. */
function signatureKey(signature: FindingSignature): string {
  return `${signature.file}:${signature.line}:${signature.messageHash}`;
}

/**
 * @purpose Builds a deterministic, comparison-only signature per finding.
 * @invariant Same `message` text always yields the same `messageHash`; different text yields a different hash with overwhelming probability.
 * @param findings Findings from an MR review report.
 * @returns One signature per input finding, same order.
 */
export function computeFindingSignatures(findings: MrDetail['findings']): FindingSignature[] {
  return findings.map((finding) => ({
    file: finding.file,
    line: finding.line,
    messageHash: createHash('sha256').update(finding.message).digest('hex').slice(0, 16),
  }));
}

/**
 * @purpose Classifies signatures across two copy-task snapshots into added / resolved / unchanged.
 * @invariant Identity is `file:line` + `messageHash` together — a changed message on the same `file:line` counts as resolved and added, never unchanged.
 * @param prev Signatures captured at the previous "Copy fix task" click.
 * @param current Signatures captured at the current click.
 * @returns Partition of both sets by presence in prev/current.
 */
export function diffFindingSignatures(
  prev: FindingSignature[],
  current: FindingSignature[]
): FindingSignatureDiff {
  const prevKeys = new Set(prev.map(signatureKey));
  const currentKeys = new Set(current.map(signatureKey));

  return {
    added: current.filter((signature) => !prevKeys.has(signatureKey(signature))),
    resolved: prev.filter((signature) => !currentKeys.has(signatureKey(signature))),
    unchanged: current.filter((signature) => prevKeys.has(signatureKey(signature))),
  };
}
