// @file: Pure parser/editor for autonomous-execute deviations stored in a ticket-local Decision Log.
// @spec: SHARED
// @consumers: sdd-check, sdd-log, sdd-task, flow-eval

import { findSectionBounds } from './section.ts';
import { DL_ID_GRAMMAR } from './requirement-id.ts';

const DEVIATION_VERDICTS = ['pending-operator', 'accepted', 'rework', 'rolled-back'] as const;

/** @purpose Closed operator-review verdict written onto an autonomous deviation record. */
export type DeviationVerdict = (typeof DEVIATION_VERDICTS)[number];

/** @purpose One typed autonomous-decision record parsed from a ticket-local Decision Log. */
export type DeviationRecord = {
  /** @purpose Canonical Decision Log entry ID. */
  id: string;
  /** @purpose Closed verdict token, or `invalid` for fail-closed unknown input. */
  verdict: DeviationVerdict | 'invalid';
  /** @purpose Full token payload preserved for diagnostics. */
  rawVerdict: string;
  /** @purpose One-based source line in the ticket. */
  line: number;
  /** @purpose Original source line, byte-preserved until an explicit verdict edit. */
  text: string;
};

const DECISION_LOG_LINE_ID_RE = /^\s*(?:-\s*)?(\S+)/;
const DEVIATION_VERDICT_RE = /\[verdict:\s*([^\]\r\n]*)\]/;

/**
 * @purpose Parse typed deviation records from the canonical ticket-local Decision Log only.
 * @invariant Ordinary Decision Log entries without a verdict token are not deviations.
 * @param content Full ticket markdown.
 * @returns Records in source order; an unknown token is explicit `invalid`, never treated closed.
 */
export function parseDeviationRecords(content: string): DeviationRecord[] {
  const bounds = findSectionBounds(content, 'DECISION_LOG');
  if (!bounds) return [];
  const lines = content.split('\n');
  const records: DeviationRecord[] = [];
  for (let index = bounds.openLine + 1; index < bounds.closeLine; index++) {
    const text = lines[index] ?? '';
    const id = DECISION_LOG_LINE_ID_RE.exec(text)?.[1];
    const rawVerdict = DEVIATION_VERDICT_RE.exec(text)?.[1]?.trim();
    if (!id || !DL_ID_GRAMMAR.test(id) || rawVerdict === undefined) continue;
    records.push({
      id,
      verdict: DEVIATION_VERDICTS.includes(rawVerdict as DeviationVerdict)
        ? (rawVerdict as DeviationVerdict)
        : 'invalid',
      rawVerdict,
      line: index + 1,
      text,
    });
  }
  return records;
}

/**
 * @purpose Identify an unresolved or malformed deviation verdict.
 * @param record Parsed Decision Log deviation.
 * @returns True only when the group-completion gate must remain open.
 */
export function deviationIsOpen(record: DeviationRecord): boolean {
  return record.verdict === 'pending-operator' || record.verdict === 'invalid';
}

/** @purpose Result of one identity-preserving Decision Log verdict edit. */
type DeviationEditResult =
  | { ok: true; content: string; before: DeviationRecord; verdict: DeviationVerdict }
  | { ok: false; detail: string };

/**
 * @purpose Replace one existing deviation's verdict token without creating a sidecar or new entry.
 * @invariant Exactly one record must match; only the closed verdict dictionary is writable.
 * @param content Full ticket markdown.
 * @param id Exact Decision Log entry ID to resolve.
 * @param verdict Closed terminal verdict selected by the operator.
 * @returns Updated content or an actionable fail-closed reason; never a partial edit.
 */
export function setDeviationVerdict(
  content: string,
  id: string,
  verdict: DeviationVerdict
): DeviationEditResult {
  if (!DEVIATION_VERDICTS.includes(verdict) || verdict === 'pending-operator') {
    return { ok: false, detail: 'verdict must be accepted | rework | rolled-back' };
  }
  const matches = parseDeviationRecords(content).filter((record) => record.id === id);
  if (matches.length !== 1) {
    return {
      ok: false,
      detail:
        matches.length === 0
          ? `deviation ${id} not found in DECISION_LOG`
          : `deviation ${id} is ambiguous (${matches.length} records)`,
    };
  }
  const before = matches[0] as DeviationRecord;
  if (before.verdict === verdict) return { ok: true, content, before, verdict };
  if (before.verdict !== 'pending-operator') {
    return {
      ok: false,
      detail: `deviation ${id} is already ${before.rawVerdict}; only pending-operator may transition to a terminal verdict`,
    };
  }
  const lines = content.split('\n');
  lines[before.line - 1] = before.text.replace(
    /\[verdict:\s*[^\]\r\n]+\]/,
    `[verdict: ${verdict}]`
  );
  return { ok: true, content: lines.join('\n'), before, verdict };
}

/**
 * @purpose Count unresolved typed deviation records across ticket contents.
 * @param contents Full markdown contents of the bounded ticket corpus.
 * @returns Total open deviation records across that corpus.
 */
export function countOpenDeviations(contents: readonly string[]): number {
  return contents.reduce(
    (total, content) => total + parseDeviationRecords(content).filter(deviationIsOpen).length,
    0
  );
}
