// @file: Bounded parser/editor for deviations in ticket, module and canonical tasks-index logs.
// @spec: SHARED
// @consumers: sdd-check, sdd-log, sdd-task, flow-eval

import { collectHeadings, findSectionBounds } from './section.ts';
import { DL_ID_GRAMMAR } from './requirement-id.ts';
import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';
import type { DeviationLogTarget } from './types/deviation-log-target.type.ts';

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

/** @purpose Select one unambiguous owner boundary and ignore fenced/example entries. */
function decisionLines(content: string, target: DeviationLogTarget) {
  const lines = content.split('\n');
  let first: number;
  let last: number;
  if (target === 'tasks-index') {
    const headings = collectHeadings(content);
    const logs = headings.filter((heading) => /^Decision Log(?:\s|$)/i.test(heading.text));
    const log = logs[0];
    if (
      logs.length !== 1 ||
      !log ||
      log.level !== 2 ||
      !/^Decision Log \((?:module-task level|scope task level|project task level)\)$/.test(log.text)
    )
      return null;
    const next = headings.find(
      (heading) => heading.start > log.start && heading.level <= log.level
    );
    first = content.slice(0, log.lineEnd).split('\n').length;
    last = next ? content.slice(0, next.start).split('\n').length - 1 : lines.length;
  } else {
    const bounds = findSectionBounds(
      content,
      target === 'module' ? 'MODULE_DECISION_LOG' : 'DECISION_LOG'
    );
    if (!bounds) return null;
    first = bounds.openLine + 1;
    last = bounds.closeLine;
  }
  let fence: MarkdownFence | null = null;
  let comment = false;
  const selected: Array<{ text: string; index: number }> = [];
  for (let index = first; index < last; index++) {
    const text = lines[index] ?? '';
    const priorFence = fence;
    fence = nextMarkdownFence(text.replace(/\r$/, ''), fence);
    if (priorFence || fence) continue;
    if (/^\s*<!--/.test(text)) comment = true;
    if (comment) {
      if (text.includes('-->')) comment = false;
      continue;
    }
    selected.push({ text, index });
  }
  return selected;
}

/**
 * @purpose Parse typed deviation records only inside the selected canonical Decision Log owner.
 * @invariant Ordinary Decision Log entries without a verdict token are not deviations.
 * @param content Full artifact markdown.
 * @param [target] Explicit log owner; ticket remains the default for existing gate consumers.
 * @returns Records in source order; an unknown token is explicit `invalid`, never treated closed.
 */
export function parseDeviationRecords(
  content: string,
  target: DeviationLogTarget = 'ticket'
): DeviationRecord[] {
  const selected = decisionLines(content, target);
  if (!selected) return [];
  const records: DeviationRecord[] = [];
  for (const { text, index } of selected) {
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
 * @param [target] Explicit owner boundary; existing ticket callers retain their original section.
 * @returns Updated content or an actionable fail-closed reason; never a partial edit.
 */
export function setDeviationVerdict(
  content: string,
  id: string,
  verdict: DeviationVerdict,
  target: DeviationLogTarget = 'ticket'
): DeviationEditResult {
  if (!DEVIATION_VERDICTS.includes(verdict) || verdict === 'pending-operator') {
    return { ok: false, detail: 'verdict must be accepted | rework | rolled-back' };
  }
  const selected = decisionLines(content, target);
  if (!selected)
    return { ok: false, detail: `deviation log for ${target} is missing or ambiguous` };
  const entries = selected.filter(({ text }) => DECISION_LOG_LINE_ID_RE.exec(text)?.[1] === id);
  if (
    entries.length > 1 ||
    entries.some(({ text }) => (text.match(/\[verdict:/g)?.length ?? 0) > 1)
  ) {
    return { ok: false, detail: `deviation ${id} is ambiguous (duplicate entry or verdict token)` };
  }
  const matches = parseDeviationRecords(content, target).filter((record) => record.id === id);
  if (matches.length !== 1) {
    return {
      ok: false,
      detail:
        matches.length === 0
          ? `deviation ${id} not found in ${target} Decision Log`
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
