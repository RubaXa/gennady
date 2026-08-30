// @file: Lazy list and atomic-entry budgets for canonical scope/module Requirements sections.
// @consumers: check, sdd-check
// @tasks: N/A

import { extractSection } from './section.ts';
import type { Finding } from './finding.ts';
import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';

const REQUIREMENTS_DEFAULT_BUDGET = 20;
/** @purpose Maximum non-empty body lines in one changed canonical requirement entry. */
export const REQUIREMENT_ENTRY_MAX_LINES = 10;
const APPROVAL =
  /^[ \t]*\*\*Requirements budget:\*\*[ \t]*(\d+)[ \t]*·[ \t]*operator-approved:[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*$/;
const APPROVAL_CANDIDATE = /^[ \t]*\*\*Requirements budget:\*\*/;
const REQUIREMENT_HEADING = /^###[ \t]+(\S+)[ \t]*\[([^\]]*)\][ \t]*$/;

type RequirementsSection = { body: string; markerLine: number };
type ApprovalCandidate = {
  index: number;
  raw: string;
  line: number;
  match: RegExpExecArray | null;
};
type RequirementBudgetEntry = {
  heading: { id: string; classTag: string };
  line: number;
  bodyLines: number;
  bodyIdentity: string;
};
type RequirementsBudgetApproval = {
  budget: number | null;
  invalidLine: number | null;
  invalidReason: string | null;
  identity: string;
};

/** @purpose Resolve the canonical scope/module Requirements body and its file-line origin. */
function requirementsSection(content: string): RequirementsSection | null {
  for (const name of ['REQUIREMENTS_AND_CONSTRAINTS', 'MODULE_REQUIREMENTS'] as const) {
    const section = extractSection(content, name);
    if (section.status !== 'ok') continue;
    const markerIndex = content.indexOf(`<!--SECTION:${name}-->`);
    return {
      body: section.content,
      markerLine: markerIndex < 0 ? 0 : content.slice(0, markerIndex).split('\n').length,
    };
  }
  return null;
}

/** @purpose Collect only canonical-field approval candidates outside fenced examples. */
function approvalCandidates(section: RequirementsSection): ApprovalCandidate[] {
  let fence: MarkdownFence | null = null;
  const candidates: ApprovalCandidate[] = [];
  for (const [index, line] of section.body.split('\n').entries()) {
    const next = nextMarkdownFence(line, fence);
    if (next !== fence) {
      fence = next;
      continue;
    }
    if (fence !== null || !APPROVAL_CANDIDATE.test(line)) continue;
    candidates.push({
      index,
      raw: line.trim(),
      line: section.markerLine + index + 1,
      match: APPROVAL.exec(line),
    });
  }
  return candidates;
}

/** @purpose Parse requirement entries fence-aware without treating nested headings as entries. */
function parseEntries(section: RequirementsSection): RequirementBudgetEntry[] {
  const lines = section.body.split('\n');
  const evidenceLines = new Set(approvalCandidates(section).map(({ index }) => index));
  const starts: { index: number; heading: RequirementBudgetEntry['heading'] }[] = [];
  let fence: MarkdownFence | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    const next = nextMarkdownFence(line, fence);
    if (next !== fence) {
      fence = next;
      continue;
    }
    if (fence !== null) continue;
    const match = REQUIREMENT_HEADING.exec(line);
    if (!match) continue;
    starts.push({
      index,
      heading: { id: match[1] as string, classTag: (match[2] as string).trim() },
    });
  }
  return starts.map((start, position) => {
    const end = starts[position + 1]?.index ?? lines.length;
    const body = lines
      .slice(start.index + 1, end)
      .filter(
        (line, offset) => line.trim().length > 0 && !evidenceLines.has(start.index + 1 + offset)
      );
    return {
      heading: start.heading,
      line: section.markerLine + start.index + 1,
      bodyLines: body.length,
      bodyIdentity: body.join('\n'),
    };
  });
}

/** @purpose True only for a real ISO calendar date. */
function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/** @purpose Parse persisted approval evidence outside fenced examples and fail closed on ambiguity. */
function parseApproval(
  section: RequirementsSection,
  baseline: RequirementsBudgetApproval | null
): RequirementsBudgetApproval {
  const candidates = approvalCandidates(section);
  const identity = candidates.map(({ raw }) => raw).join('\n');
  if (candidates.length === 0)
    return { budget: null, invalidLine: null, invalidReason: null, identity };
  if (candidates.length !== 1)
    return {
      budget: null,
      invalidLine: candidates[1]?.line ?? candidates[0]?.line ?? section.markerLine,
      invalidReason:
        'Requirements budget authorization must be exactly one canonical line; duplicate or conflicting evidence cannot authorize a cap.',
      identity,
    };
  const candidate = candidates[0] as (typeof candidates)[number];
  if (!candidate.match)
    return {
      budget: null,
      invalidLine: candidate.line,
      invalidReason:
        'Malformed Requirements budget evidence. Use exactly `**Requirements budget:** <N> · operator-approved: <YYYY-MM-DD>` after operator approval.',
      identity,
    };
  const budget = Number(candidate.match[1]);
  const date = candidate.match[2] as string;
  if (!Number.isSafeInteger(budget) || budget <= REQUIREMENTS_DEFAULT_BUDGET)
    return {
      budget: null,
      invalidLine: candidate.line,
      invalidReason: `Requirements budget approval must raise the current/default cap above ${REQUIREMENTS_DEFAULT_BUDGET}; ${budget} cannot authorize it.`,
      identity,
    };
  if (!isCalendarDate(date))
    return {
      budget: null,
      invalidLine: candidate.line,
      invalidReason: `Requirements budget approval date ${date} is not a real YYYY-MM-DD calendar date.`,
      identity,
    };
  if (baseline?.budget !== null && baseline?.budget !== undefined && budget < baseline.budget)
    return {
      budget: null,
      invalidLine: candidate.line,
      invalidReason: `Requirements budget approval ${budget} cannot lower the previously authorized cap ${baseline.budget}.`,
      identity,
    };
  return { budget, invalidLine: null, invalidReason: null, identity };
}

/**
 * @purpose Validate lazy list and atomic-entry budgets against the HEAD baseline.
 * @param file Spec path.
 * @param content Current spec bytes.
 * @param baselineContent HEAD bytes, or null for a new artifact.
 * @returns Findings only for invalid evidence or newly changed cognitive growth.
 */
export function checkRequirementBudgetsAgainstBaseline(
  file: string,
  content: string,
  baselineContent: string | null
): Finding[] {
  const section = requirementsSection(content);
  if (section === null) return [];
  const entries = parseEntries(section);
  const baselineSection = baselineContent === null ? null : requirementsSection(baselineContent);
  const baselineEntries = baselineSection ? parseEntries(baselineSection) : [];
  const baselineById = new Map(baselineEntries.map((entry) => [entry.heading.id, entry]));
  const findings: Finding[] = [];
  const baselineApproval = baselineSection ? parseApproval(baselineSection, null) : null;
  const approval = parseApproval(section, baselineApproval);
  if (approval.invalidReason !== null)
    findings.push({
      severity: 'error',
      code: 'SDD_REQUIREMENTS_BUDGET_APPROVAL_INVALID',
      file,
      line: approval.invalidLine ?? undefined,
      message: approval.invalidReason,
    });
  if (entries.length === 0) return findings;
  const identity = (list: RequirementBudgetEntry[]): string =>
    list
      .map(({ heading, bodyIdentity }) => `${heading.id}\0${heading.classTag}\0${bodyIdentity}`)
      .join('\u0001');
  const unchanged =
    baselineSection !== null &&
    identity(entries) === identity(baselineEntries) &&
    approval.identity === baselineApproval?.identity;
  const budget = approval.budget ?? REQUIREMENTS_DEFAULT_BUDGET;
  if (entries.length > budget && !unchanged)
    findings.push({
      severity: 'error',
      code: 'SDD_REQUIREMENTS_BUDGET_EXCEEDED',
      file,
      line: entries[0]?.line,
      message:
        `Requirements contains ${entries.length} entries; current budget is ${budget}. ` +
        'First review the list for duplicates, requirements that can be combined, and detail that belongs in Architecture/DbC. ' +
        `If the larger list is intentional, ask the operator once and record the answer here exactly: ` +
        `\`**Requirements budget:** ${entries.length} · operator-approved: YYYY-MM-DD\`.`,
    });
  for (const entry of entries) {
    if (entry.bodyLines <= REQUIREMENT_ENTRY_MAX_LINES) continue;
    if (baselineById.get(entry.heading.id)?.bodyIdentity === entry.bodyIdentity) continue;
    findings.push({
      severity: 'error',
      code: 'SDD_REQUIREMENT_ENTRY_TOO_LONG',
      file,
      line: entry.line,
      message:
        `${entry.heading.id} has ${entry.bodyLines} non-empty body lines (> ${REQUIREMENT_ENTRY_MAX_LINES}). ` +
        'Keep one atomic behavior here: split independent behavior into another requirement, or move implementation/contract detail to Architecture or DbC.',
    });
  }
  return findings;
}
