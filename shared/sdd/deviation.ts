// @file: Bounded parser/editor for deviations in ticket, module and canonical tasks-index logs.
// @spec: SHARED
// @consumers: sdd-check, sdd-log, sdd-task, flow-eval

import { collectHeadings, findSectionBounds } from './section.ts';
import { DL_ID_GRAMMAR } from './requirement-id.ts';
import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';
import type { DeviationLogTarget } from './types/deviation-log-target.type.ts';
import type { ExecutionDecision } from './types/execution-decision.type.ts';

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
const EXECUTION_DECISION_KEYS = [
  'id',
  'what',
  'why',
  'where',
  'evidence',
  'alternative',
  'verify',
] as const;

/**
 * @purpose Validate Handoff references against one canonical log, without treating prose as a decision store.
 * @param content Full ticket including its canonical Decision Log.
 * @param text Comma-separated Handoff deviation references.
 * @param [phase] Expected owner phase when validating phase completion.
 * @returns Null when references resolve, otherwise an actionable fail-closed diagnostic.
 */
export function decisionReferenceIssue(
  content: string,
  text: string,
  phase?: string
): string | null {
  const refs = text.trim()
    ? text.split(',').map((entry) => entry.split(':', 1)[0]?.trim() ?? '')
    : [];
  const records = parseDeviationRecords(content);
  const selected = decisionLines(content, 'ticket');
  for (const id of refs) {
    const matches = records.filter((record) => record.id === id);
    const entries =
      selected?.filter(({ text: line }) => DECISION_LOG_LINE_ID_RE.exec(line)?.[1] === id) ?? [];
    if (
      !DL_ID_GRAMMAR.test(id) ||
      entries.length !== 1 ||
      (entries[0]?.text.match(/\[verdict:/g)?.length ?? 0) !== 1 ||
      matches.length !== 1 ||
      matches[0]?.verdict === 'invalid'
    )
      return `Handoff deviation ${id || '(empty)'} must reference exactly one canonical Decision Log entry; record it with sdd-log decision before use`;
    const ownerPhase = / — phase: (P[0-9]+);/.exec(matches[0]?.text ?? '')?.[1];
    if (phase && ownerPhase && ownerPhase !== phase)
      return `Handoff deviation ${id} belongs to ${ownerPhase}, not ${phase}`;
  }
  return new Set(refs).size === refs.length
    ? null
    : 'Handoff deviations contain duplicate Decision Log references';
}

/**
 * @purpose Validate untrusted decision JSON and prepare one canonical pending record before action.
 * @invariant Only DECISION_LOG gains a line; retries preserve the existing date and verdict.
 * @param content Current ticket bytes, including its canonical Decision Log.
 * @param raw Untrusted decoded JSON from the bounded scratch payload.
 * @param phase Phase owning the decision; it never expands targets or authority.
 * @param date CLI-owned calendar date.
 * @returns Complete candidate bytes or an actionable rejection without mutation.
 */
export function appendExecutionDecision(
  content: string,
  raw: unknown,
  phase: string,
  date: string
): { ok: true; content: string; id: string; created: boolean } | { ok: false; detail: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, detail: 'decision payload must be one JSON object' };
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== [...EXECUTION_DECISION_KEYS].sort().join(','))
    return {
      ok: false,
      detail: 'decision keys must be exactly: id, what, why, where, evidence, alternative, verify',
    };
  for (const key of EXECUTION_DECISION_KEYS) {
    const field = value[key];
    if (
      typeof field !== 'string' ||
      !field.trim() ||
      /[\x00-\x1f\x7f\u2028\u2029]|\[verdict:|<!--|-->/i.test(field)
    )
      return {
        ok: false,
        detail: `decision ${key} must be a non-empty single line without reserved markup`,
      };
  }
  const decision = value as ExecutionDecision;
  if (
    !DL_ID_GRAMMAR.test(decision.id) ||
    !/^P[0-9]+$/.test(phase) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    return { ok: false, detail: 'decision needs a canonical DL ID, P<digits> phase and CLI date' };
  const selected = decisionLines(content, 'ticket');
  const bounds = findSectionBounds(content, 'DECISION_LOG');
  if (!selected || !bounds) return { ok: false, detail: 'ticket needs one canonical Decision Log' };
  const body = `phase: ${phase}; what: ${decision.what}; why: ${decision.why}; where: ${decision.where}; evidence: ${decision.evidence}; alternative: ${decision.alternative}; verify: ${decision.verify}`;
  const entries = selected.filter(
    ({ text }) => DECISION_LOG_LINE_ID_RE.exec(text)?.[1] === decision.id
  );
  if (entries.length) {
    const records = parseDeviationRecords(content).filter((record) => record.id === decision.id);
    const record = records[0];
    if (
      entries.length !== 1 ||
      records.length !== 1 ||
      !record ||
      record.verdict === 'invalid' ||
      record.text.replace(/^\S+ \d{4}-\d{2}-\d{2} — /, '').replace(/\r$/, '') !==
        `${body} [verdict: ${record.rawVerdict}]`
    )
      return {
        ok: false,
        detail: `decision ${decision.id} conflicts with an existing entry; do not overwrite it`,
      };
    if (record.verdict === 'rework' || record.verdict === 'rolled-back')
      return {
        ok: false,
        detail: `decision ${decision.id} is ${record.verdict}; do not apply this rejected choice`,
      };
    return { ok: true, content, id: decision.id, created: false };
  }
  const lines = content.split('\n');
  const cr = content.includes('\r\n') ? '\r' : '';
  lines.splice(
    bounds.closeLine,
    0,
    `${decision.id} ${date} — ${body} [verdict: pending-operator]${cr}`
  );
  const candidate = lines.join('\n');
  if (parseDeviationRecords(candidate).filter((record) => record.id === decision.id).length !== 1)
    return {
      ok: false,
      detail: 'decision would be hidden by a fence/comment; repair the canonical log first',
    };
  return { ok: true, content: candidate, id: decision.id, created: true };
}

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
