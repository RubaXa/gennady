// @file: Inject canonical <!--SECTION:NAME--> anchors into a v1 ticket (plain `## N.` headers) — pure, for migration.
// @consumers: sdd-migrate.cmd
// @tasks: N/A

import { extractSection } from './section.ts';
import { parsePhasesOverview } from './ticket.ts';

/**
 * @purpose Map a markdown header (level + text) to its canonical v2 section name, or null when it is not a section.
 * @invariant `## 3. Phases` (the container header) maps to null — only its `### P<N>` children are anchored.
 * @param level Header level (2 for `##`, 3 for `###`).
 * @param text Header text without the leading `#`s.
 * @returns The canonical SECTION name, or null when the header is not a canonical section.
 */
function canonicalName(level: number, text: string): string | null {
  const t = text.trim();

  const phase = /^P(\d+)(\b|_FIX\b)/i.exec(t);
  if (level === 3 && phase) return `PHASE_P${phase[1]}${/_FIX/i.test(t) ? '_FIX' : ''}`;

  if (level !== 2) return null;
  const lower = t.toLowerCase();
  if (/\bmeta\b/.test(lower)) return 'META';
  if (/phases overview/.test(lower)) return 'PHASES_OVERVIEW';
  if (/acceptance criteria|\bbdd\b/.test(lower)) return 'BDD';
  if (/\bverification\b/.test(lower)) return 'VERIFICATION';
  if (/test scenario coverage|test coverage/.test(lower)) return 'TEST_COVERAGE';
  if (/execution log/.test(lower)) return 'EXECUTION_LOG';
  if (/decision log/.test(lower)) return 'DECISION_LOG';
  return null;
}

/** @purpose One `## `/`### ` header line with its canonical section name (null when not a section). */
type Header = { idx: number; level: number; name: string | null };

/** @purpose Collect every `## `/`### ` header with its canonical name. | @param lines File split by `\n`. | @returns Headers in document order. */
function collectHeaders(lines: string[]): Header[] {
  const headers: Header[] = [];
  lines.forEach((line, i) => {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m && m[1] && m[2])
      headers.push({ idx: i, level: m[1].length, name: canonicalName(m[1].length, m[2]) });
  });
  return headers;
}

/**
 * @purpose Body of one canonical v1 header — text from just after it to the next header of level ≤ its own (or EOF).
 * @invariant Reuses `injectAnchors`' header/span logic — a legacy body is exactly what it would wrap in markers.
 * @param content Full markdown (v1, plain headers).
 * @param name Canonical section name (e.g. `META`, `EXECUTION_LOG`).
 * @returns The header's body text, or null when no header maps to `name`.
 */
export function legacyHeaderBody(content: string, name: string): string | null {
  const lines = content.split('\n');
  const headers = collectHeaders(lines);
  const h = headers.find((x) => x.name === name);
  if (!h) return null;
  let end = lines.length;
  for (const next of headers) {
    if (next.idx > h.idx && next.level <= h.level) {
      end = next.idx;
      break;
    }
  }
  return lines.slice(h.idx + 1, end).join('\n');
}

/**
 * @purpose Wrap each canonical section of a v1 ticket in `<!--SECTION:NAME-->` / `<!--/SECTION:NAME-->` markers.
 * @invariant A section spans from its header to the next header of level ≤ its own (or EOF); sections never nest.
 * @invariant Idempotent — a section already carrying its open marker is left untouched.
 * @param content Full ticket markdown (v1, plain headers).
 * @returns The anchored text and the list of section names that were injected (empty when already anchored / not a ticket).
 */
export function injectAnchors(content: string): { text: string; injected: string[] } {
  const lines = content.split('\n');
  const headers = collectHeaders(lines); // every ## / ### header with its canonical name

  // #region START_SPANS — for each canonical header, span ends at the next header of level ≤ its own
  const openAt = new Map<number, string>();
  const closeAt = new Map<number, string>();
  const injected: string[] = [];
  for (let h = 0; h < headers.length; h++) {
    const cur = headers[h];
    if (!cur || cur.name === null) continue;
    if (content.includes(`<!--SECTION:${cur.name}-->`)) continue; // idempotent
    let end = lines.length;
    for (let k = h + 1; k < headers.length; k++) {
      const next = headers[k];
      if (next && next.level <= cur.level) {
        end = next.idx;
        break;
      }
    }
    openAt.set(cur.idx, cur.name);
    closeAt.set(end, cur.name);
    injected.push(cur.name);
  }
  // #endregion END_SPANS

  if (injected.length === 0) return { text: content, injected: [] };

  // #region START_EMIT — splice markers: close before the span-end line, open before the header line
  const out: string[] = [];
  for (let i = 0; i <= lines.length; i++) {
    const close = closeAt.get(i);
    if (close) out.push(`<!--/SECTION:${close}-->`);
    const open = openAt.get(i);
    if (open) out.push(`<!--SECTION:${open}-->`);
    if (i < lines.length) out.push(lines[i] as string);
  }
  // #endregion END_EMIT

  return { text: out.join('\n'), injected };
}

/**
 * @purpose Scaffold a minimal `## Execution Log` section onto a v1 ticket (Meta header/anchor present)
 * that never had one, so `isTicket` stops missing it.
 * @invariant Idempotent — a text that already carries the EXECUTION_LOG open marker is left untouched.
 * @invariant Only fires when a Meta header/anchor is present; files with no Meta signature are not touched.
 * @param content Ticket markdown, typically already run through `injectAnchors`.
 * @param dateStr Migration date stamp for the scaffolded note line (caller-supplied — this stays pure).
 * @returns The (possibly appended) text and whether a section was scaffolded.
 */
export function scaffoldExecutionLog(
  content: string,
  dateStr: string
): { text: string; scaffolded: boolean } {
  const hasMeta =
    content.includes('<!--SECTION:META-->') || legacyHeaderBody(content, 'META') !== null;
  const hasExecLog = content.includes('<!--SECTION:EXECUTION_LOG-->');
  if (!hasMeta || hasExecLog) return { text: content, scaffolded: false };

  const block = [
    '',
    '## Execution Log',
    '<!--SECTION:EXECUTION_LOG-->',
    `- ${dateStr} migrated from v1 — no rounds/phases recorded in v1 format`,
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');

  const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content;
  return { text: `${trimmed}\n${block}\n`, scaffolded: true };
}

const EXECUTION_LOG_OPEN = '<!--SECTION:EXECUTION_LOG-->';
const EXECUTION_LOG_CLOSE = '<!--/SECTION:EXECUTION_LOG-->';
const PHASE_RECEIPTS_SCHEMA_MARKER = '<!--PHASE_RECEIPTS:v1-->';

/**
 * @purpose Scaffold a canonical, all-unchecked `### Round 1` block (one `#### P<N>` per Phases
 *   Overview row, plus `#### Round close`) into an EXISTING Execution Log that lacks one.
 * @invariant Companion to `upgradeVerificationTable`'s `'phase-receipts'` change: `PHASE_RECEIPTS:v1`
 *   makes `sdd-check` require a Round-1 phase-block shape (`SDD_EXECUTION_LOG_ROUND_MISSING`) — this
 *   scaffolds it in the same write. Every box stays `[ ]`: the shape, never a fabricated DONE.
 * @invariant Idempotent — a body that already has a `### Round <N>` heading (any number) is left
 *   untouched.
 * @invariant PATCH, never rewrite (V-BATCH-22 B-1): any existing body is preserved byte-for-byte;
 *   the Round-1 scaffold is appended after it, never substituted for it.
 * @param content Full ticket markdown (already anchored).
 * @param phaseIds Phase ids from Phases Overview, in row order (e.g. `['P1', 'P2']`).
 * @param dateStr Migration date stamp for the Round heading.
 * @returns The (possibly rewritten) text and whether a Round-1 block was scaffolded.
 */
export function scaffoldFirstRound(
  content: string,
  phaseIds: readonly string[],
  dateStr: string
): { text: string; scaffolded: boolean } {
  if (!content.includes(PHASE_RECEIPTS_SCHEMA_MARKER) || phaseIds.length === 0)
    return { text: content, scaffolded: false };
  if (/^###\s+Round\s+\d/m.test(content)) return { text: content, scaffolded: false }; // already round-shaped

  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === EXECUTION_LOG_OPEN);
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === EXECUTION_LOG_CLOSE);
  if (startIdx === -1 || endIdx === -1) return { text: content, scaffolded: false };

  // The existing body, PRESERVED byte-for-byte — never discarded, only appended to. `existingBody`
  // may be empty (a v1-migrated placeholder with no history) or carry real prior content; either way
  // it survives unchanged in `nextLines` below.
  const existingBody = lines.slice(startIdx + 1, endIdx);
  const hasExistingContent = existingBody.some((l) => l.trim() !== '');

  const round = [
    `### Round 1 — ${dateStr}, initial`,
    '',
    ...phaseIds.flatMap((id) => [
      `#### ${id}`,
      '- [ ] `<ts>` DONE',
      '**Handoff →** artifacts: [...]; decisions: [...]; open: [...]',
      '',
    ]),
    '#### Round close',
    '- [ ] `<ts>` DONE',
  ];
  const nextLines = hasExistingContent
    ? [...lines.slice(0, startIdx + 1), ...existingBody, '', ...round, ...lines.slice(endIdx)]
    : [...lines.slice(0, startIdx + 1), '', ...round, ...lines.slice(endIdx)];
  return { text: nextLines.join('\n'), scaffolded: true };
}

const VERIFICATION_OPEN = '<!--SECTION:VERIFICATION-->';
const VERIFICATION_CLOSE = '<!--/SECTION:VERIFICATION-->';
const PHASE_RECEIPTS_MARKER = '<!--PHASE_RECEIPTS:v1-->';
const COVERAGE_POLICY_MARKER = '<!--COVERAGE_POLICY:v1-->';

// Same shape as the ad-hoc scripts/upgrade-verification-tables.py this ports (batch 6/7 experiments):
// a v1 Verification table has no Role column at all — v2 requires it, and rejects the 2-column shape
// with SDD_VERIFICATION_TABLE_INVALID (the exact wall a real execute run hit, migration-grade.ts's
// E-07 red-first bar).
const HDR_2COL = /^\|\s*Command\s*\|\s*Required by\s*\|\s*$/;
const SEP_2COL = /^\|[\s:-]+\|[\s:-]+\|\s*$/;
const ROW_2COL = /^\|(.+?)\|(.+?)\|\s*$/;

/** @purpose Mechanically assign Role: a coverage reader is `coverage`; an explicit test-runner
 *  invocation is `probe`; everything else is `extra` — the schema's conservative default. */
function roleFor(cmd: string): 'coverage' | 'probe' | 'extra' {
  if (/testcov|test:coverage|--coverage/.test(cmd)) return 'coverage';
  if (/\bnpm (run )?test\b/.test(cmd)) return 'probe';
  return 'extra';
}

/** @purpose Kinds of change `upgradeVerificationTable` can make, in the order it can make them. */
export type VerificationUpgradeChange = 'table' | 'phase-receipts' | 'coverage-policy';

/**
 * @purpose Upgrade a v1 2-column Verification table to the v2 3-column schema (adds Role), and —
 *   only when unambiguous — add the `PHASE_RECEIPTS:v1`/`COVERAGE_POLICY:v1` markers v1 never had.
 *   Migrator-completeness (E-06): closes the red-first `SDD_VERIFICATION_TABLE_INVALID` bar (E-07).
 * @invariant Idempotent — a table already 3-column is left untouched (no `'table'` change reported).
 * @invariant Never invents a Coverage Owner Phase: `COVERAGE_POLICY:v1` needs exactly one
 *   Role=coverage row AND one `test`-kind Phases Overview row — else legacy (grandfathered), never
 *   a marker with an unresolved field.
 * @param content Full ticket markdown, already anchored (run after `injectAnchors`).
 * @returns The (possibly rewritten) text and which parts changed, in the order applied.
 */
export function upgradeVerificationTable(content: string): {
  text: string;
  changed: VerificationUpgradeChange[];
} {
  const changed: VerificationUpgradeChange[] = [];
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === VERIFICATION_OPEN);
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === VERIFICATION_CLOSE);
  if (startIdx === -1 || endIdx === -1) return { text: content, changed }; // not anchored yet / no section

  let body = lines.slice(startIdx + 1, endIdx);

  // #region START_TABLE — 2-column -> 3-column, Role assigned mechanically
  const out: string[] = [];
  let coverageRows = 0;
  let tableChanged = false;
  for (let i = 0; i < body.length; i++) {
    const line = body[i] as string;
    if (HDR_2COL.test(line) && SEP_2COL.test(body[i + 1] ?? '')) {
      out.push('| Command | Required by | Role |');
      out.push('|---------|-------------|------|');
      tableChanged = true;
      i += 1; // consumed the separator too
      while (i + 1 < body.length) {
        const row = body[i + 1] as string;
        const m = ROW_2COL.exec(row);
        if (!m) break;
        const cmd = (m[1] as string).trim();
        const req = (m[2] as string).trim();
        const role = roleFor(cmd);
        if (role === 'coverage') coverageRows++;
        out.push(`| ${cmd} | ${req} | ${role} |`);
        i += 1;
      }
      continue;
    }
    out.push(line);
  }
  if (tableChanged) changed.push('table');
  body = out;
  // #endregion END_TABLE

  // #region START_PHASE_RECEIPTS — schema marker, once, right after the section opens
  const hasPhaseReceipts = body.some((l) => l.trim() === PHASE_RECEIPTS_MARKER);
  if (tableChanged && !hasPhaseReceipts) {
    body = [PHASE_RECEIPTS_MARKER, '', ...body];
    changed.push('phase-receipts');
  }
  // #endregion END_PHASE_RECEIPTS

  // #region START_COVERAGE_POLICY — only when unambiguous (never invent an owner phase)
  const hasCoveragePolicy = body.some((l) => l.trim() === COVERAGE_POLICY_MARKER);
  if (tableChanged && !hasCoveragePolicy && coverageRows === 1) {
    const overview = extractSection(content, 'PHASES_OVERVIEW');
    const testPhases =
      overview.status === 'ok'
        ? parsePhasesOverview(overview.content).filter((p) => /^test$/i.test(p.kind))
        : [];
    if (testPhases.length === 1) {
      const owner = testPhases[0]?.id as string;
      const insertAt = body.findIndex((l) => l.trim() === PHASE_RECEIPTS_MARKER) + 1;
      body = [
        ...body.slice(0, insertAt),
        '',
        COVERAGE_POLICY_MARKER,
        '- **Coverage Policy:** required',
        `- **Coverage Owner Phase:** ${owner}`,
        ...body.slice(insertAt),
      ];
      changed.push('coverage-policy');
    }
  }
  // #endregion END_COVERAGE_POLICY

  if (changed.length === 0) return { text: content, changed };
  const nextLines = [...lines.slice(0, startIdx + 1), ...body, ...lines.slice(endIdx)];
  return { text: nextLines.join('\n'), changed };
}
