// @file: Pure parser/editor for autonomous-execute deviations stored in a ticket-local Decision Log.
// @spec: SHARED
// @consumers: sdd-check, sdd-log, sdd-task, flow-eval

import { findSectionBounds } from './section.ts';

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

const DEVIATION_TOKEN_RE =
  /^\s*(?:-\s*)?([A-Z][A-Z0-9]*-DL-[1-9][0-9]*)\b.*\[verdict:\s*([^\]\r\n]+)\]/;

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
    const match = DEVIATION_TOKEN_RE.exec(text);
    if (!match?.[1] || !match[2]) continue;
    const rawVerdict = match[2].trim();
    const token = rawVerdict.split(/\s+/)[0] ?? '';
    records.push({
      id: match[1],
      verdict: DEVIATION_VERDICTS.includes(token as DeviationVerdict)
        ? (token as DeviationVerdict)
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
