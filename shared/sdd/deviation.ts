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
 * @purpose Resolve exactly one canonical Decision Log record, counting even untyped same-ID entries.
 * @param content Owning artifact bytes.
 * @param id Exact decision identity.
 * @param target Canonical log owner kind.
 * @returns One well-formed record, or null for missing/duplicate/invalid evidence.
 */
export function canonicalDecisionRecord(
  content: string,
  id: string,
  target: DeviationLogTarget
): DeviationRecord | null {
  if (!DL_ID_GRAMMAR.test(id)) return null;
  const entries =
    decisionLines(content, target)?.filter(
      ({ text }) => DECISION_LOG_LINE_ID_RE.exec(text)?.[1] === id
    ) ?? [];
  const records = parseDeviationRecords(content, target).filter((record) => record.id === id);
  if (
    entries.length !== 1 ||
    (entries[0]?.text.match(/\[verdict:/g)?.length ?? 0) !== 1 ||
    records.length !== 1 ||
    records[0]?.verdict === 'invalid'
  )
    return null;
  return records[0]!;
}

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
  for (const id of refs) {
    const record = canonicalDecisionRecord(content, id, 'ticket');
    if (!record)
      return `Handoff deviation ${id || '(empty)'} must reference exactly one canonical Decision Log entry; record it with sdd-log decision before use`;
    const ownerPhase = / — phase: (P[0-9]+);/.exec(record.text)?.[1];
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
  const body = `phase: ${phase}; what: ${decision.what}; why: ${decision.why}; where: ${decision.where}; evidence: ${decision.evidence}; alternative: ${decision.alternative}; verify: ${decision.verify}`;
  return appendCanonicalDecision(content, decision.id, body, date, 'ticket');
}

/**
 * @purpose Append one pending proposal idempotently to the existing canonical Decision Log.
 * @param content Current owner bytes.
 * @param id Exact decision ID.
 * @param body Validated decision body without verdict markup.
 * @param date CLI-owned date.
 * @param target Ticket or module log boundary.
 * @returns Candidate bytes or conflict; terminal rejected decisions cannot be replayed.
 */
function appendCanonicalDecision(
  content: string,
  id: string,
  body: string,
  date: string,
  target: 'ticket' | 'module'
): ReturnType<typeof appendExecutionDecision> {
  const selected = decisionLines(content, target);
  const bounds = findSectionBounds(
    content,
    target === 'module' ? 'MODULE_DECISION_LOG' : 'DECISION_LOG'
  );
  if (!selected || !bounds)
    return { ok: false, detail: 'artifact needs one canonical Decision Log' };
  const entries = selected.filter(({ text }) => DECISION_LOG_LINE_ID_RE.exec(text)?.[1] === id);
  if (entries.length) {
    const records = parseDeviationRecords(content, target).filter((record) => record.id === id);
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
        detail: `decision ${id} conflicts with an existing entry; do not overwrite it`,
      };
    if (record.verdict === 'rework' || record.verdict === 'rolled-back')
      return {
        ok: false,
        detail: `decision ${id} is ${record.verdict}; do not apply this rejected choice`,
      };
    return { ok: true, content, id, created: false };
  }
  const lines = content.split('\n');
  const cr = content.includes('\r\n') ? '\r' : '';
  lines.splice(bounds.closeLine, 0, `${id} ${date} — ${body} [verdict: pending-operator]${cr}`);
  const candidate = lines.join('\n');
  if (parseDeviationRecords(candidate, target).filter((record) => record.id === id).length !== 1)
    return {
      ok: false,
      detail: 'decision would be hidden by a fence/comment; repair the canonical log first',
    };
  return { ok: true, content: candidate, id, created: true };
}

/** @purpose Machine-readable scope attached to a module decision; never a caller-selected verdict. */
type ModuleLintDecision = ExecutionDecision & {
  lintExemption: { file: string; checks: Array<'dbc' | 'inventory'> };
};

/** @purpose Validate a closed proposal schema before writing or consuming its scoped permissions. */
function moduleLintDecision(raw: unknown): ModuleLintDecision | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !==
    [...EXECUTION_DECISION_KEYS, 'lintExemption'].sort().join(',')
  )
    return null;
  for (const key of EXECUTION_DECISION_KEYS) {
    const field = value[key];
    if (
      typeof field !== 'string' ||
      !field.trim() ||
      /[\x00-\x1f\x7f\u2028\u2029]|\[verdict:|<!--|-->/i.test(field)
    )
      return null;
  }
  if (
    !DL_ID_GRAMMAR.test(value.id as string) ||
    (value.why as string).replace(/\s/g, '').length < 8
  )
    return null;
  const exemption = value.lintExemption;
  if (!exemption || typeof exemption !== 'object' || Array.isArray(exemption)) return null;
  const scope = exemption as Record<string, unknown>;
  if (
    Object.keys(scope).sort().join(',') !== 'checks,file' ||
    typeof scope.file !== 'string' ||
    scope.file !== value.where ||
    scope.file.trim() !== scope.file ||
    /[\\*?{}:]/.test(scope.file) ||
    scope.file.split('/').some((part) => !part || part === '.' || part === '..') ||
    !Array.isArray(scope.checks) ||
    scope.checks.length === 0 ||
    scope.checks.some((check) => check !== 'dbc' && check !== 'inventory') ||
    new Set(scope.checks).size !== scope.checks.length
  )
    return null;
  const decision = value as ModuleLintDecision;
  return {
    id: decision.id,
    what: decision.what,
    why: decision.why,
    where: decision.where,
    evidence: decision.evidence,
    alternative: decision.alternative,
    verify: decision.verify,
    lintExemption: {
      file: decision.lintExemption.file,
      checks: [...decision.lintExemption.checks].sort(),
    },
  };
}

/**
 * @purpose Propose a scoped module lint exception through the same pending-to-terminal decision mechanism.
 * @invariant The proposal cannot supply a verdict; operator review is a role, not authenticated identity.
 * @param content Module spec with one canonical MODULE_DECISION_LOG.
 * @param raw Untrusted JSON containing seven decision fields and lintExemption file/checks.
 * @param date CLI-owned calendar date.
 * @returns Pending candidate or rejection; retry never changes an existing decision's scope.
 */
export function appendModuleLintExemptionDecision(
  content: string,
  raw: unknown,
  date: string
): ReturnType<typeof appendExecutionDecision> {
  const decision = moduleLintDecision(raw);
  if (!decision || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return {
      ok: false,
      detail:
        'module decision requires id, what, why, where, evidence, alternative, verify and lintExemption {file, checks}; where must be the exact file, checks only dbc/inventory, no verdict field',
    };
  return appendCanonicalDecision(
    content,
    decision.id,
    `decision: ${JSON.stringify(decision)}`,
    date,
    'module'
  );
}

/**
 * @purpose Read the scoped binding of one canonical module proposal after separate operator acceptance.
 * @param record Unique module record resolved by canonicalDecisionRecord.
 * @returns Validated binding or null; ordinary/bare accepted prose is not a scoped proposal.
 */
export function acceptedModuleLintExemption(
  record: DeviationRecord
): ModuleLintDecision['lintExemption'] | null {
  if (record.verdict !== 'accepted') return null;
  const match = /^\S+ \d{4}-\d{2}-\d{2} — decision: (.+) \[verdict: accepted\]\r?$/.exec(
    record.text
  );
  if (!match) return null;
  try {
    const decision = moduleLintDecision(JSON.parse(match[1]!));
    return decision?.id === record.id ? decision.lintExemption : null;
  } catch {
    return null;
  }
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
