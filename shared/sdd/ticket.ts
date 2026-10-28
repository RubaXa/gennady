// @file: Pure parsers for SDD ticket sections (Meta, Phases Overview, phase bodies, Verification) — shared by sdd-task/sdd-check.
// @spec: SHARED
// @consumers: sdd-task.cmd

import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';
import { lexMarkdownTableRow, unescapeMarkdownTablePipes } from './markdown-table.ts';

/**
 * @purpose Visible declaration text only; code fences and HTML comments cannot add authority.
 * @param content Raw ticket/spec Markdown.
 * @returns Visible prose with hidden regions blanked, preserving line separation.
 */
export function visibleSddMarkdown(content: string): string {
  let fence: MarkdownFence | null = null;
  let comment = false;
  return content
    .split('\n')
    .map((line) => {
      if (fence !== null) {
        fence = nextMarkdownFence(line, fence);
        return '';
      }
      let visible = '';
      let offset = 0;
      while (offset < line.length) {
        if (comment) {
          const end = line.indexOf('-->', offset);
          if (end < 0) break;
          comment = false;
          offset = end + 3;
        } else {
          const start = line.indexOf('<!--', offset);
          if (start < 0) {
            visible += line.slice(offset);
            break;
          }
          visible += line.slice(offset, start);
          comment = true;
          offset = start + 4;
        }
      }
      fence = nextMarkdownFence(visible, null);
      return fence === null ? visible : '';
    })
    .join('\n');
}

const noWriteLabels = new Set(['none', '—', '(нет — проверочная фаза)']);

/**
 * @purpose Decode exact inline or nested path declarations, rejecting prose instead of proving empty output.
 * @param content Raw phase declaration body.
 * @param label Canonical write or delete path field.
 * @param fail Receives every malformed or ambiguous declaration without inventing authority.
 * @returns Exact literal paths; no-write labels produce an empty list, not Verify proof.
 */
export function parsePhasePaths(
  content: string,
  label: 'Target Files' | 'Deleted Files',
  fail: (detail: string) => void
): string[] {
  const lines = visibleSddMarkdown(content).split('\n');
  const field = new RegExp(`^\\s*-\\s+\\*\\*${label}:\\*\\*[ \\t]*(.*)$`);
  const indexes = lines.flatMap((line, index) => (field.test(line) ? [index] : []));
  if (indexes.length === 0) {
    if (label === 'Target Files') fail('Missing canonical Target Files field');
    return [];
  }
  if (indexes.length !== 1) {
    fail(`Duplicate ${label} fields`);
    return [];
  }
  const start = indexes[0]!;
  const inline = field.exec(lines[start]!)![1]!.trim();
  const nested: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    if (/^\s*(?:-\s+)?\*\*[^*]+\*\*|^\s*#{1,6}\s/.test(line)) break;
    const bullet = /^\s+-\s+(.+)$/.exec(line);
    if (!bullet) {
      fail(`${label} needs exact inline paths or nested path bullets`);
      return [];
    }
    nested.push(bullet[1]!.trim());
  }
  if (inline && nested.length) {
    fail(`${label} mixes inline and nested declarations`);
    return [];
  }
  const entries = inline ? [inline] : nested;
  if (entries.length === 1 && noWriteLabels.has(entries[0]!.toLowerCase())) return [];
  const paths: string[] = [];
  for (const entry of entries) {
    let remaining = entry;
    if (noWriteLabels.has(entry.toLowerCase()) || /[,;]\s*$/.test(entry)) {
      fail(`${label} mixes a no-write label or empty entry with paths`);
      return [];
    }
    while (remaining) {
      const match =
        /^(?:`([^`\r\n]+)`|([^\s`,;()]+))(?:[ \t]+\([^()\r\n]*\))?[ \t]*(?:[,;][ \t]*|$)/.exec(
          remaining
        );
      const path = match?.[1] ?? match?.[2];
      if (!match || !path || path.endsWith('/') || noWriteLabels.has(path.toLowerCase())) {
        fail(
          `${label} must list exact files; put unconditional removals in Deleted Files, not prose or directories`
        );
        return [];
      }
      paths.push(path);
      remaining = remaining.slice(match[0].length);
    }
  }
  return paths;
}

/** @purpose One Spec Reference entry from Meta. */
export type SpecRef = {
  /** @purpose Role label (Contract / Adapter / Consumer / …), or empty if the bullet had none. */
  role: string;
  /** @purpose Linked entity name (the link text). */
  name: string;
  /** @purpose Link target (spec anchor / path). */
  anchor: string;
};

/** @purpose Parsed Meta planning fields of a ticket. */
export type MetaInfo = {
  /** @purpose Task-ID (`<ACR>-<slug>`) or null. */
  taskId: string | null;
  /** @purpose Status token (e.g. `[x] DONE`) or null. */
  status: string | null;
  /** @purpose One-line purpose, or null. */
  purpose: string | null;
  /** @purpose Owning scope, or null. */
  scope: string | null;
  /** @purpose Owning module, or null. */
  module: string | null;
  /** @purpose Dependency Task-IDs (empty when None). */
  dependencies: string[];
  /** @purpose Spec References — the enumerable contract set. */
  specRefs: SpecRef[];
};

/** @purpose One row of the Phases Overview table. */
export type PhaseOverview = {
  /** @purpose Phase id (e.g. P1). */
  id: string;
  /** @purpose Phase kind (bootstrap/impl/test/config/doc/refactor). */
  kind: string;
  /** @purpose Phase dependency ids (empty when —). */
  deps: string[];
  /** @purpose Status flag cell (e.g. `[ ]`). */
  status: string;
};

/** @purpose Parsed body of one phase section. */
export type PhaseDetail = {
  /** @purpose One-line objective, or null. */
  objective: string | null;
  /** @purpose Rule links (markdown link targets) the phase activates. */
  rules: string[];
  /** @purpose Target file paths the phase may write. */
  targetFiles: string[];
  /** @purpose Malformed declarations must block path/phase authority, never become an empty plan. */
  pathIssues?: string[];
  /** @purpose Repo-local tracked paths this phase intentionally removes. */
  deletedFiles: string[];
  /** @purpose Missing readiness gates this phase structurally creates; absent for ordinary phases. */
  readinessGates: string[];
  /** @purpose Optional per-phase spec-anchor subset (`Spec Refs:` bullets) — when empty, callers fall back to the ticket's whole Meta Spec References. */
  specRefs: string[];
  /** @purpose Inputs line (e.g. `none`, `P1 handoff`), or null. */
  inputs: string | null;
  /** @purpose Exit criterion, or null. */
  exit: string | null;
};

/** @purpose One Verification gate row. */
export type Gate = {
  /** @purpose The resolved check command. */
  command: string;
  /** @purpose Rule-ids that require this gate. */
  requiredBy: string[];
  /** @purpose Structured gate role; `coverage` identifies the ticket's one coverage reader. */
  role: string | null;
};

/** @purpose Marker distinguishing coverage-policy-aware tickets from grandfathered legacy tickets. */
const COVERAGE_POLICY_SCHEMA_MARKER = '<!--COVERAGE_POLICY:v1-->';

/** @purpose Parsed, validated coverage applicability from one ticket Verification section. */
export type TicketCoveragePolicy =
  | { status: 'required'; command: string; ownerPhase: string }
  | { status: 'not-applicable'; reason: string }
  | { status: 'legacy' }
  | { status: 'invalid'; issues: string[] };

/** @purpose Extract the inline value after a `- **Label:**` field, or null. */
function inlineField(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*-?\\s*\\*\\*${escaped}:\\*\\*[ \\t]*([^\\r\\n]*)`, 'im');
  const m = body.match(re);
  const value = m?.[1]?.trim();
  return value ? value : null;
}

/** @purpose Collect the `- ` sub-bullets that follow a `**Label:**` line, until the next bold field or dedent. */
function bulletsUnder(body: string, label: string): string[] {
  const lines = body.split('\n');
  const out: string[] = [];
  let active = false;
  for (const line of lines) {
    const boldField = /^\s*-\s+\*\*([^*]+)\*\*/.exec(line);
    if (boldField) {
      active = boldField[1]?.replace(/:\s*$/, '').trim().toLowerCase() === label.toLowerCase();
      continue;
    }
    if (!active) continue;
    if (line.trim() === '') continue;
    if (/^\s*-\s+/.test(line)) out.push(line.trim().replace(/^-\s+/, '').trim());
    else break;
  }
  return out;
}

/** @purpose Pull the link text + target from a markdown link, or treat the whole string as the name. */
function parseLink(s: string): { name: string; anchor: string } {
  const m = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (m && m[1] && m[2]) return { name: m[1], anchor: m[2] };
  return { name: s.trim(), anchor: '' };
}

/**
 * @purpose Parse the planning fields of a ticket Meta section.
 * @param metaBody Text between the META markers.
 * @returns A MetaInfo; absent fields are null / empty.
 */
export function parseMetaInfo(metaBody: string): MetaInfo {
  const taskId = metaBody.match(/\*\*Task-ID:\*\*\s*`?([A-Za-z0-9][\w-]*)`?/)?.[1] ?? null;
  const status = metaBody.match(/\*\*Status:\*\*\s*(\[.\]\s*[A-Z_]+)/)?.[1] ?? null;
  const depsRaw = inlineField(metaBody, 'Dependencies');
  const dependencies =
    !depsRaw || /^none$/i.test(depsRaw.trim())
      ? []
      : depsRaw
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);

  const specRefs = bulletsUnder(metaBody, 'Spec References').map((b) => {
    const colon = b.indexOf(':');
    const hasRole = colon !== -1 && colon < b.indexOf('[');
    const role = hasRole ? b.slice(0, colon).trim() : '';
    const { name, anchor } = parseLink(hasRole ? b.slice(colon + 1) : b);
    return { role, name, anchor };
  });

  return {
    taskId,
    status,
    purpose: inlineField(metaBody, 'Purpose'),
    scope: inlineField(metaBody, 'Scope'),
    module: inlineField(metaBody, 'Module'),
    dependencies,
    specRefs,
  };
}

/**
 * @purpose Split a simple non-Verification markdown table row into trimmed content cells.
 * @param line One `| a | b |`-shaped source line.
 * @returns Trimmed cell contents, without the leading/trailing empty split artifacts.
 */
export function rowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * @purpose True for a table separator row like `|---|---|`.
 * @param line One source line.
 * @returns Whether the line is a markdown table separator, not a header or data row.
 */
export function isSeparator(line: string): boolean {
  return /^\|?\s*:?-{2,}/.test(line.trim());
}

/** @purpose Remove one exact markdown code-span wrapper and report whether bytes were wrapped. */
function parseInlineCode(value: string): { value: string; wrapped: boolean } {
  const trimmed = value.trim();
  const delimiter = trimmed.match(/^`+/)?.[0];
  const wrapped = Boolean(
    delimiter && trimmed.length >= delimiter.length * 2 && trimmed.endsWith(delimiter)
  );
  return {
    value: wrapped && delimiter ? trimmed.slice(delimiter.length, -delimiter.length) : trimmed,
    wrapped,
  };
}

/** @purpose Remove one exact markdown code-span wrapper without rewriting bytes inside it. */
function unwrapInlineCode(value: string): string {
  return parseInlineCode(value).value;
}

/** @purpose Column indices of a PHASES_OVERVIEW row, learned from its header — not assumed by position. */
export type PhaseColumnMap = {
  /** @purpose Index (into rowCells output) of the phase-id column. */
  id: number;
  /** @purpose Index of the kind column, or -1 when the header did not name one. */
  kind: number;
  /** @purpose Index of the deps column, or -1 when the header did not name one. */
  deps: number;
  /** @purpose Index of the status column. */
  status: number;
};

/** @purpose Header cell text (lowercased) → the PhaseColumnMap field it names. `phase` is the legacy v1 id-column name. */
const PHASE_COLUMN_ALIASES: Record<string, keyof PhaseColumnMap> = {
  id: 'id',
  phase: 'id',
  kind: 'kind',
  deps: 'deps',
  dependencies: 'deps',
  status: 'status',
};

/**
 * @purpose Map a PHASES_OVERVIEW header row to id/kind/deps/status column indices — tolerant of
 *   both the canonical `| ID | Kind | Deps | Status |` order and the legacy v1
 *   `| Phase | Kind | Status | Target Files | Deps |` order (`Phase` aliases `id`; a `Target
 *   Files` or other unrecognized column is simply skipped, not mismapped).
 * @param cells Trimmed cell contents of one row (see rowCells) — header or not.
 * @returns The column map, or null when the row names neither a recognizable id nor status column.
 */
export function matchPhaseOverviewHeader(cells: string[]): PhaseColumnMap | null {
  const map: Partial<PhaseColumnMap> = {};
  cells.forEach((cell, i) => {
    const key = PHASE_COLUMN_ALIASES[cell.toLowerCase()];
    if (key && map[key] === undefined) map[key] = i;
  });
  if (map.id === undefined || map.status === undefined) return null;
  return { id: map.id, kind: map.kind ?? -1, deps: map.deps ?? -1, status: map.status };
}

/**
 * @purpose Parse the Phases Overview table.
 * @param body Text of the PHASES_OVERVIEW section.
 * @returns One PhaseOverview per data row.
 */
export function parsePhasesOverview(body: string): PhaseOverview[] {
  const out: PhaseOverview[] = [];
  let columns: PhaseColumnMap | null = null;
  let sawHeader = false;
  for (const line of body.split('\n')) {
    if (!line.trimStart().startsWith('|') || isSeparator(line)) continue;
    const cells = rowCells(line);
    if (cells.length < 2) continue;
    if (!sawHeader) {
      sawHeader = true;
      columns = matchPhaseOverviewHeader(cells);
      continue; // the header row itself is never a data row, matched or not
    }
    const cols = columns ?? { id: 0, kind: 1, deps: 2, status: 3 };
    const id = cells[cols.id];
    if (!id) continue;
    const kind = cols.kind >= 0 ? cells[cols.kind] : undefined;
    const deps = cols.deps >= 0 ? cells[cols.deps] : undefined;
    const status = cells[cols.status];
    out.push({
      id,
      kind: kind ?? '',
      deps:
        !deps || deps === '—'
          ? []
          : deps
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean),
      status: status ?? '',
    });
  }
  return out;
}

/**
 * @purpose Parse one phase section body into its planning fields.
 * @param phaseBody Text between a PHASE_P<n> marker pair.
 * @returns The PhaseDetail (objective, rule links, target files, inputs, exit).
 */
export function parsePhaseDetail(phaseBody: string): PhaseDetail {
  const pathIssues: string[] = [];
  const note = (detail: string) => pathIssues.push(detail);
  const targetFiles = parsePhasePaths(phaseBody, 'Target Files', note);
  const deletedFiles = parsePhasePaths(phaseBody, 'Deleted Files', note);
  return {
    ...(pathIssues.length ? { pathIssues } : {}),
    objective: inlineField(phaseBody, 'Objective'),
    rules: bulletsUnder(phaseBody, 'Rules').map((b) => parseLink(b).anchor || parseLink(b).name),
    targetFiles,
    deletedFiles,
    readinessGates: bulletsUnder(phaseBody, 'Readiness Gates').map((b) =>
      b.replace(/`/g, '').trim()
    ),
    specRefs: bulletsUnder(phaseBody, 'Spec Refs').map(
      (b) => parseLink(b).anchor || parseLink(b).name
    ),
    inputs: inlineField(phaseBody, 'Inputs'),
    exit: inlineField(phaseBody, 'Exit'),
  };
}

/**
 * @purpose Parse the Verification gate table.
 * @param body Text of the VERIFICATION section.
 * @returns One Gate per command row.
 */
export function parseVerification(body: string): Gate[] {
  const parsed = parseVerificationTable(body, false);
  return parsed.ok ? parsed.gates : [];
}

/** @purpose Whether every cell in a lexed row is a markdown separator token. */
function separatorCells(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/** @purpose Build a line-numbered teaching issue for a malformed Verification table row. */
function verificationRowIssue(line: number, issue: string): string {
  return `Verification table line ${line}: ${issue}`;
}

/** @purpose Exact canonical Verification header for strict or grandfathered parsing. */
function verificationHeader(cells: readonly string[], strict: boolean): boolean {
  const normalized = cells.map((cell) => cell.trim().toLowerCase());
  return strict
    ? normalized.length === 3 &&
        normalized[0] === 'command' &&
        normalized[1] === 'required by' &&
        normalized[2] === 'role'
    : (normalized.length === 2 || normalized.length === 3) &&
        normalized[0] === 'command' &&
        normalized[1] === 'required by' &&
        (normalized.length === 2 || normalized[2] === 'role');
}

/** @purpose Whether a source line can be a Markdown table row without parsing ordinary prose. */
function tableRowCandidate(line: string): boolean {
  return line.includes('|');
}

/**
 * @purpose Parse Verification with the exact three-column schema required by mechanical consumers.
 * @param body Text of the VERIFICATION section.
 * @param [strict] Whether every table row must declare Command, Required by, and Role.
 * @returns Parsed gates or all teaching structural issues.
 */
export function parseVerificationTable(
  body: string,
  strict = true
): { ok: true; gates: Gate[] } | { ok: false; issues: string[] } {
  const out: Gate[] = [];
  const issues: string[] = [];
  const headerIssues: string[] = [];
  const lines = body.split('\n');
  let headerIndex = -1;

  for (const [index, line] of lines.entries()) {
    if (!tableRowCandidate(line)) continue;
    const row = lexMarkdownTableRow(line);
    if (!row.ok) {
      if (/\bCommand\b/i.test(line)) headerIssues.push(verificationRowIssue(index + 1, row.issue));
      continue;
    }
    if (row.cells[0]?.trim().toLowerCase() !== 'command') continue;
    if (!verificationHeader(row.cells, strict)) {
      headerIssues.push(
        verificationRowIssue(
          index + 1,
          `expected header ${strict ? 'Command | Required by | Role' : 'Command | Required by [| Role]'}`
        )
      );
      continue;
    }
    if (headerIndex !== -1) {
      issues.push(verificationRowIssue(index + 1, 'duplicate canonical header'));
      continue;
    }
    headerIndex = index;
  }

  if (headerIndex === -1) {
    if (headerIssues.length > 0) issues.push(...headerIssues);
    else
      issues.push(
        verificationRowIssue(
          1,
          `missing canonical header ${strict ? 'Command | Required by | Role' : 'Command | Required by [| Role]'}`
        )
      );
    return { ok: false, issues };
  }

  const separatorIndex = headerIndex + 1;
  const separatorLine = lines[separatorIndex] ?? '';
  const separator = lexMarkdownTableRow(separatorLine);
  const separatorCellCount = strict ? 3 : separator.ok ? separator.cells.length : 0;
  if (
    !separator.ok ||
    !separatorCells(separator.cells) ||
    (strict ? separator.cells.length !== 3 : separatorCellCount < 2 || separatorCellCount > 3)
  ) {
    issues.push(
      verificationRowIssue(
        separatorIndex + 1,
        `expected ${strict ? 'three-column' : 'two- or three-column'} separator immediately after the header`
      )
    );
    return { ok: false, issues };
  }

  for (let index = separatorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') break;
    if (!tableRowCandidate(line)) continue;
    const row = lexMarkdownTableRow(line);
    if (!row.ok) {
      issues.push(verificationRowIssue(index + 1, row.issue));
      continue;
    }
    const cells = row.cells;
    const validCellCount = strict ? cells.length === 3 : cells.length === 2 || cells.length === 3;
    if (!validCellCount) {
      issues.push(
        verificationRowIssue(
          index + 1,
          `expected exactly ${strict ? 3 : '2 or 3'} cells (Command | Required by | Role), found ${cells.length}`
        )
      );
      continue;
    }
    if (separatorCells(cells)) {
      issues.push(verificationRowIssue(index + 1, 'unexpected separator inside table data'));
      continue;
    }
    if (cells[0]?.toLowerCase() === 'command') {
      issues.push(verificationRowIssue(index + 1, 'duplicate canonical header'));
      continue;
    }
    const [command, requiredBy, role] = cells;
    if (!command) {
      issues.push(verificationRowIssue(index + 1, 'Command cell must not be empty'));
      continue;
    }
    const parsedCommand = parseInlineCode(command);
    out.push({
      command: parsedCommand.wrapped
        ? parsedCommand.value
        : unescapeMarkdownTablePipes(parsedCommand.value),
      requiredBy: (requiredBy ?? '')
        .split(',')
        .map((r) => unescapeMarkdownTablePipes(r.trim()))
        .filter(Boolean),
      role: unescapeMarkdownTablePipes(role?.trim() ?? '').toLowerCase() || null,
    });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, gates: out };
}

/** @purpose Collect every exact bold-field value so duplicate/conflicting policy declarations stay visible. */
function fieldValues(body: string, label: string): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*-\\s+\\*\\*${escaped}:\\*\\*\\s*(.+?)\\s*$`, 'gim');
  return [...body.matchAll(re)].map((match) => unwrapInlineCode(match[1] ?? ''));
}

/** @purpose Whether a structured field is still an empty scaffold token rather than a decision. */
function missingDecision(value: string): boolean {
  return value.trim() === '' || /^(?:—|none|<[^>]+>)$/i.test(value.trim());
}

/**
 * @purpose Parse the ticket's explicit coverage applicability and its one role-tagged reader command.
 * @invariant No path, extension, platform, threshold, or command is inferred; legacy means the schema
 *   marker and every structured coverage field/role are absent.
 * @param verificationBody Text inside SECTION:VERIFICATION.
 * @returns Valid required/N-A policy, grandfathered legacy, or all structural issues.
 */
export function parseTicketCoveragePolicy(verificationBody: string): TicketCoveragePolicy {
  const policies = fieldValues(verificationBody, 'Coverage Policy').map((value) =>
    value.toLowerCase()
  );
  const reasons = fieldValues(verificationBody, 'Coverage Reason');
  const owners = fieldValues(verificationBody, 'Coverage Owner Phase');
  const legacyGates = parseVerification(verificationBody);
  const coverageGates = legacyGates.filter((gate) => gate.role === 'coverage');
  const aware =
    verificationBody.includes(COVERAGE_POLICY_SCHEMA_MARKER) ||
    policies.length > 0 ||
    reasons.length > 0 ||
    owners.length > 0 ||
    coverageGates.length > 0;
  if (!aware) return { status: 'legacy' };

  const verification = parseVerificationTable(verificationBody);
  if (!verification.ok) return { status: 'invalid', issues: verification.issues };
  const strictCoverageGates = verification.gates.filter((gate) => gate.role === 'coverage');

  const issues: string[] = [];
  if (policies.length !== 1)
    issues.push(`Coverage Policy must appear exactly once (found ${policies.length})`);
  const policy = policies[0];
  if (policy !== 'required' && policy !== 'not-applicable')
    issues.push('Coverage Policy must be exactly `required` or `not-applicable`');

  if (policy === 'required') {
    if (reasons.length > 0)
      issues.push(
        'required coverage forbids Coverage Reason; the reason belongs only to not-applicable'
      );
    if (strictCoverageGates.length !== 1)
      issues.push(
        `required coverage needs exactly one table row with Role=coverage (found ${strictCoverageGates.length})`
      );
    if (strictCoverageGates[0] && missingDecision(strictCoverageGates[0].command))
      issues.push('required coverage command is unresolved');
    if (owners.length !== 1 || !/^P[0-9]+$/.test(owners[0] ?? ''))
      issues.push('required coverage needs exactly one Coverage Owner Phase (`P<N>`)');
  }
  if (policy === 'not-applicable') {
    if (reasons.length !== 1 || missingDecision(reasons[0] ?? ''))
      issues.push('not-applicable coverage needs exactly one concise Coverage Reason');
    if (strictCoverageGates.length > 0)
      issues.push('not-applicable coverage forbids a table row with Role=coverage');
    if (owners.length > 0) issues.push('not-applicable coverage forbids Coverage Owner Phase');
  }
  if (issues.length > 0) return { status: 'invalid', issues };
  if (policy === 'required')
    return {
      status: 'required',
      command: strictCoverageGates[0]?.command ?? '',
      ownerPhase: owners[0] ?? '',
    };
  return { status: 'not-applicable', reason: reasons[0] ?? '' };
}
