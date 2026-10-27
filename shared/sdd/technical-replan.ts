// @file: Bounded additive technical replanning; preserves the ticket's product and verification declarations.
// @spec: SHARED
// @consumers: sdd-log, sdd-task

import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { extractSection, findSectionBounds } from './section.ts';
import {
  matchPhaseOverviewHeader,
  parsePhaseDetail,
  parsePhasesOverview,
  rowCells,
  type PhaseOverview,
} from './ticket.ts';
import type { TicketCorpusRef } from './ticket-resolve.ts';
import { phaseVerificationNodeReaches } from './phase-verification-plan.ts';
import { isSddEvidencePath } from './corpus-path.ts';
import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';
import { checkTaskGraph } from './check.ts';
import {
  parseTechnicalPhaseInsertion,
  prepareTechnicalPhaseInsertion,
  type TechnicalPhaseInsertion,
} from './technical-replan-phases.ts';

/**
 * @purpose Exact observed bytes precondition, not an approval or semantic proof.
 * @param content Exact observed ticket bytes.
 * @returns Prefixed SHA-256 identity.
 */
export function technicalReplanBase(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/** @purpose Preserve plan bytes while allowing later append-only execution facts on lost-ack retry. */
function planIdentity(content: string): string {
  let source = content;
  for (const name of ['EXECUTION_LOG', 'DECISION_LOG']) {
    const bounds = findSectionBounds(source, name);
    if (!bounds) continue;
    const lines = source.split('\n');
    lines.splice(bounds.openLine + 1, bounds.closeLine - bounds.openLine - 1);
    source = lines.join('\n');
  }
  return technicalReplanBase(source);
}

/** @purpose One bounded means change; no arbitrary Markdown, removed obligations, kinds or checks. */
type TechnicalReplan = {
  id: string;
  base: string;
  reason: string;
  evidence: string;
  addTargets: string[];
  dependencies: string[];
  insertPhase?: TechnicalPhaseInsertion;
  moveTests?: string[];
};

/** @purpose Prepared immutable transition or a refusal before any ticket write. */
export type TechnicalReplanResult =
  | { ok: true; content: string; created: boolean; id: string }
  | { ok: false; detail: string };

/** @purpose Bound prose to one printable, non-structural log field. */
function prose(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 1600 &&
    !/[\x00-\x1f\x7f\u2028\u2029<>`]/u.test(value)
  );
}

/** @purpose Reject extra authority-bearing fields and normalize only the exact supported delta. */
function parsePayload(raw: unknown): TechnicalReplan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if (
    keys !== 'addTargets,base,dependencies,evidence,id,reason' &&
    keys !== 'addTargets,base,dependencies,evidence,id,insertPhase,moveTests,reason'
  )
    return null;
  if (
    typeof value.id !== 'string' ||
    !/^RP-[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(value.id) ||
    typeof value.base !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(value.base) ||
    !prose(value.reason) ||
    !prose(value.evidence) ||
    !Array.isArray(value.addTargets) ||
    value.addTargets.length > 32 ||
    value.addTargets.some(
      (p) => typeof p !== 'string' || /[<>`\x00-\x1f\x7f\u2028\u2029]/u.test(p)
    ) ||
    !Array.isArray(value.dependencies) ||
    value.dependencies.length > 64 ||
    value.dependencies.some((p) => typeof p !== 'string' || !/^P[0-9]+$/.test(p)) ||
    new Set(value.addTargets).size !== value.addTargets.length ||
    new Set(value.dependencies).size !== value.dependencies.length
  )
    return null;
  if (
    keys.includes('insertPhase') &&
    (!parseTechnicalPhaseInsertion(value.insertPhase) ||
      !Array.isArray(value.moveTests) ||
      value.moveTests.length > 32 ||
      value.moveTests.some(
        (p) => typeof p !== 'string' || /[<>`\x00-\x1f\x7f\u2028\u2029]/u.test(p)
      ) ||
      new Set(value.moveTests).size !== value.moveTests.length)
  )
    return null;
  return value as TechnicalReplan;
}

/** @purpose Reuse phase dependency traversal for DAG and exact ordered-writer claims. */
function reaches(phases: readonly PhaseOverview[], from: string, target: string): boolean {
  const pending = [...(phases.find((p) => p.id === from)?.deps ?? [])];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop();
    if (!id || seen.has(id)) continue;
    if (id === target) return true;
    seen.add(id);
    pending.push(...(phases.find((p) => p.id === id)?.deps ?? []));
  }
  return false;
}

/** @purpose Replace a uniquely anchored section without touching any neighboring bytes. */
function replaceSection(source: string, name: string, body: string): string {
  const bounds = findSectionBounds(source, name);
  if (!bounds) throw new Error(`TechnicalReplan#replaceSection: ambiguous ${name}`);
  const lines = source.split('\n');
  lines.splice(bounds.openLine + 1, bounds.closeLine - bounds.openLine - 1, ...body.split('\n'));
  return lines.join('\n');
}

/** @purpose Ignore example receipts and refuse a log whose append point would remain hidden. */
function liveLogLines(body: string): string[] | null {
  let fence: MarkdownFence | null = null;
  let comment = false;
  const result: string[] = [];
  for (const line of body.split('\n')) {
    if (!comment) {
      const prior = fence;
      fence = nextMarkdownFence(line, fence);
      if (prior || fence) continue;
    }
    let commented = comment;
    let cursor = 0;
    while (cursor < line.length) {
      const token = comment ? '-->' : '<!--';
      const index = line.indexOf(token, cursor);
      if (index < 0) break;
      commented = true;
      comment = !comment;
      cursor = index + token.length;
    }
    if (!commented && !comment) result.push(line);
  }
  return fence || comment ? null : result;
}

/**
 * @purpose Prepare a bounded target/dependency/provider/test-ownership delta and its durable log fact.
 * @invariant No removed obligations, changed kinds, product/BDD/test/verification fields or self-approval;
 *   caller holds the replan-corpus and ticket leases and rereads the corpus before applying.
 * @param input Observed ticket, exact phase, bounded payload and complete ticket corpus.
 * @returns Candidate bytes with a readable delta, or a reason without candidate bytes.
 */
export function prepareTechnicalReplan(input: {
  root: string;
  ticketFile: string;
  content: string;
  phaseId: string;
  payload: unknown;
  corpus: readonly TicketCorpusRef[];
  timestamp: string;
}): TechnicalReplanResult {
  const fail = (detail: string): TechnicalReplanResult => ({ ok: false, detail });
  const payload = parsePayload(input.payload);
  if (!payload)
    return fail(
      'replan JSON requires id, base, reason, evidence, addTargets, dependencies; optional pair insertPhase and moveTests; no authority/check overrides'
    );
  const eol = input.content.includes('\r\n') ? '\r\n' : '\n';
  const content = input.content.replaceAll('\r\n', '\n');
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  const log = extractSection(content, 'EXECUTION_LOG');
  const section = extractSection(content, `PHASE_${input.phaseId}`);
  if (overview.status !== 'ok' || log.status !== 'ok' || section.status !== 'ok')
    return fail('replan needs unique readable phase, overview and open Execution Log');
  const signatureParts: unknown[] = [
    input.phaseId,
    payload.id,
    payload.base,
    payload.reason,
    payload.evidence,
    payload.addTargets,
    payload.dependencies,
  ];
  if (payload.insertPhase)
    signatureParts.push(
      [
        payload.insertPhase.id,
        payload.insertPhase.objective,
        payload.insertPhase.targets,
        payload.insertPhase.dependencies,
      ],
      payload.moveTests
    );
  const signature = technicalReplanBase(JSON.stringify(signatureParts));
  const prefix = `- [x] technical-replan ${payload.id} `;
  const live = liveLogLines(log.content);
  if (!live) return fail('replan log has an unclosed fence/comment; do not hide a canonical fact');
  const previous = live.filter((line) => line.startsWith(prefix));
  const replay = previous.length > 0;
  if (previous.length) {
    if (previous.length !== 1 || !previous[0]?.startsWith(`${prefix}${signature} `))
      return fail('replan ID is duplicated or belongs to a different delta');
    const result = previous[0].split(' ')[5];
    if (result !== planIdentity(content))
      return fail(
        'replan was recorded but the plan changed; redispatch instead of reapplying an obsolete delta'
      );
  }
  if (!replay && technicalReplanBase(input.content) !== payload.base)
    return fail('replan base is stale; reread sdd-task before proposing a new delta');
  const phases = parsePhasesOverview(overview.content);
  const selected = phases.filter((p) => p.id === input.phaseId);
  if (
    new Set(phases.map((p) => p.id)).size !== phases.length ||
    selected.length !== 1 ||
    !/^\[ \](?:\s+[A-Z_]+)?$/.test(selected[0]?.status ?? '')
  )
    return fail('replan requires one incomplete phase; completed phases are not rewritten');
  if (payload.insertPhase && !payload.dependencies.includes(payload.insertPhase.id))
    return fail('source must depend on the inserted provider before redispatch');
  if (
    payload.dependencies.some(
      (d) => !phases.some((p) => p.id === d) && d !== payload.insertPhase?.id
    )
  )
    return fail('replan dependency names an absent phase');
  let nextPhases = phases.map((p) =>
    p.id === input.phaseId ? { ...p, deps: payload.dependencies } : p
  );
  if (payload.insertPhase && !replay)
    nextPhases.splice(
      nextPhases.findIndex((p) => p.id === input.phaseId),
      0,
      {
        id: payload.insertPhase.id,
        kind: selected[0]?.kind ?? '',
        deps: payload.insertPhase.dependencies,
        status: '[ ]',
      }
    );
  if (nextPhases.some((p) => reaches(nextPhases, p.id, p.id)))
    return fail('replan would create a phase dependency cycle');
  const detail = parsePhaseDetail(section.content);
  if (
    replay &&
    (payload.addTargets.some((p) => !detail.targetFiles.includes(p)) ||
      selected[0]?.deps.join(',') !== payload.dependencies.join(','))
  )
    return fail('recorded replan postconditions are absent; do not acknowledge an unapplied delta');
  const allTargets = phases.flatMap((p) => {
    const body = extractSection(content, `PHASE_${p.id}`);
    return body.status === 'ok' ? parsePhaseDetail(body.content).targetFiles : [];
  });
  const roots = allTargets.map(dirname).filter((p) => p !== '.');
  for (const path of [
    ...new Set([...payload.addTargets, ...(payload.insertPhase?.targets ?? [])]),
  ]) {
    const inspected = inspectRepoPath(input.root, path, 'potential');
    if (!inspected.ok || inspected.relative !== path)
      return fail(
        `replan target ${path}: ${inspected.ok ? 'use canonical repo-relative spelling' : inspected.detail}`
      );
    try {
      if (!lstatSync(inspected.absolute).isFile())
        return fail(`replan target ${path} is not a regular file`);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT')
        return fail(`replan target ${path} cannot be inspected`);
    }
    if (
      path
        .split('/')
        .some((p) => p.startsWith('.') || ['node_modules', 'dist', 'coverage'].includes(p)) ||
      path.startsWith('specs/') ||
      isSddEvidencePath(path)
    )
      return fail(`replan target ${path} is protected or is not a product implementation path`);
    if (!roots.some((dir) => path.startsWith(`${dir}/`)))
      return fail(
        `replan target ${path} has no existing non-root implementation boundary in this ticket`
      );
    if (!replay && payload.addTargets.includes(path) && detail.targetFiles.includes(path))
      return fail(`replan target ${path} is already declared`);
  }
  if (
    !replay &&
    !payload.insertPhase &&
    !payload.addTargets.length &&
    selected[0]?.deps.join(',') === payload.dependencies.join(',')
  )
    return fail('replan has no technical delta');
  // Inputs naming an earlier phase remain obligations even if an incidental edge is removed.
  for (const id of detail.inputs?.match(/\bP[0-9]+\b/g) ?? [])
    if (!reaches(nextPhases, input.phaseId, id))
      return fail(`replan would detach declared input ${id}`);
  let columns: ReturnType<typeof matchPhaseOverviewHeader> = null;
  const overviewLines = overview.content.split('\n');
  let changedRows = 0;
  const nextOverview = overviewLines
    .map((line) => {
      if (!line.trimStart().startsWith('|')) return line;
      const cells = rowCells(line);
      const header = matchPhaseOverviewHeader(cells);
      if (header) {
        columns = header;
        return line;
      }
      if (!columns || cells[columns.id] !== input.phaseId) return line;
      if (columns.deps < 0) return line;
      cells[columns.deps] = payload.dependencies.join(', ') || '—';
      changedRows++;
      return `| ${cells.join(' | ')} |`;
    })
    .join('\n');
  if (changedRows !== 1) return fail('replan needs one explicit dependency cell');
  let nextBody = section.content;
  if (!replay && payload.addTargets.length) {
    const lines = nextBody.split('\n');
    const fields = lines.flatMap((line, index) =>
      /^\s*-\s+\*\*Target Files:\*\*/.test(line) ? [index] : []
    );
    if (fields.length !== 1) return fail('replan needs one unambiguous Target Files field');
    const start = fields[0] ?? 0;
    if (lines[start]?.trim() !== '- **Target Files:**')
      return fail('replan needs canonical Target Files bullets');
    let end = start + 1;
    while (end < lines.length && !/^\s*-\s+\*\*/.test(lines[end] ?? '')) end++;
    lines.splice(end, 0, ...payload.addTargets.map((p) => `  - \`${p}\``));
    nextBody = lines.join('\n');
  }
  let next = replay ? content : replaceSection(content, 'PHASES_OVERVIEW', nextOverview);
  if (!replay) next = replaceSection(next, `PHASE_${input.phaseId}`, nextBody);
  if (payload.insertPhase) {
    const extended = prepareTechnicalPhaseInsertion({
      content: next,
      sourceId: input.phaseId,
      originalPhases: phases,
      originalSourceBody: section.content,
      insertion: payload.insertPhase,
      moveTests: payload.moveTests ?? [],
      replay,
    });
    if (!extended.ok) return fail(extended.detail);
    next = extended.content;
    nextPhases = extended.phases;
  }
  const corpus = input.corpus.map((ref) =>
    resolve(ref.file) === resolve(input.ticketFile) ? { ...ref, content: next } : ref
  );
  if (!corpus.some((ref) => resolve(ref.file) === resolve(input.ticketFile)))
    return fail('replan ticket is absent from the complete corpus');
  const graphIssue = checkTaskGraph([...corpus]).find((finding) => finding.severity === 'error');
  if (graphIssue) return fail(`replan corpus graph: ${graphIssue.message}`);
  const claims = new Map<string, string[]>();
  for (const ref of corpus) {
    const ov = extractSection(ref.content, 'PHASES_OVERVIEW');
    if (ov.status !== 'ok')
      return fail(`unreadable writer overview ${relative(input.root, ref.file)}`);
    const declared = parsePhasesOverview(ov.content);
    if (
      !declared.length ||
      new Set(declared.map((p) => p.id)).size !== declared.length ||
      declared.some(
        (p) =>
          !/^P[0-9]+$/.test(p.id) ||
          p.deps.some((d) => !declared.some((q) => q.id === d)) ||
          reaches(declared, p.id, p.id)
      )
    )
      return fail(`invalid writer phase graph ${relative(input.root, ref.file)}`);
    for (const phase of declared) {
      const body = extractSection(ref.content, `PHASE_${phase.id}`);
      if (body.status !== 'ok') return fail(`unreadable writer phase ${phase.id}`);
      const detail = parsePhaseDetail(body.content);
      const normalized: string[] = [];
      for (const path of [...detail.targetFiles, ...detail.deletedFiles]) {
        const proven = inspectRepoPath(input.root, path, 'potential');
        if (!proven.ok) return fail(`unsafe writer claim ${path}: ${proven.detail}`);
        normalized.push(proven.relative);
      }
      claims.set(JSON.stringify([resolve(ref.file), phase.id]), normalized);
    }
  }
  // Recheck every selected writer, not just the added paths: removing an edge must not break ordering.
  for (const phase of nextPhases) {
    const body = extractSection(next, `PHASE_${phase.id}`);
    if (body.status !== 'ok') return fail(`replan has unreadable phase ${phase.id}`);
    const own = claims.get(JSON.stringify([resolve(input.ticketFile), phase.id])) ?? [];
    for (const ref of corpus) {
      const ov = extractSection(ref.content, 'PHASES_OVERVIEW');
      if (ov.status !== 'ok')
        return fail(`unreadable writer overview ${relative(input.root, ref.file)}`);
      for (const other of parsePhasesOverview(ov.content)) {
        if (resolve(ref.file) === resolve(input.ticketFile) && phase.id === other.id) continue;
        const otherBody = extractSection(ref.content, `PHASE_${other.id}`);
        if (otherBody.status !== 'ok') return fail(`unreadable writer phase ${other.id}`);
        const otherClaims = claims.get(JSON.stringify([resolve(ref.file), other.id])) ?? [];
        const overlap = own.find((p) => otherClaims.includes(p));
        if (!overlap) continue;
        const from = { ticketFile: input.ticketFile, phaseId: phase.id };
        const to = { ticketFile: ref.file, phaseId: other.id };
        if (
          !phaseVerificationNodeReaches(corpus, from, to) &&
          !phaseVerificationNodeReaches(corpus, to, from)
        )
          return fail(
            `replan creates an unordered writer for ${overlap}: ${relative(input.root, ref.file)}#${other.id}`
          );
      }
    }
  }
  if (replay) return { ok: true, content: input.content, created: false, id: payload.id };
  const fact = `${prefix}${signature} ${planIdentity(next)} phase=${input.phaseId} at=${input.timestamp}; addTargets=${JSON.stringify(payload.addTargets)}; deps=${JSON.stringify(selected[0]?.deps)} -> ${JSON.stringify(payload.dependencies)};${payload.insertPhase ? ` insertPhase=${JSON.stringify(payload.insertPhase)}; moveTests=${JSON.stringify(payload.moveTests)};` : ''} reason=${payload.reason}; evidence=${payload.evidence}`;
  const bounds = findSectionBounds(next, 'EXECUTION_LOG');
  if (!bounds) return fail('replan Execution Log became ambiguous');
  const lines = next.split('\n');
  lines.splice(bounds.closeLine, 0, fact);
  next = lines.join('\n');
  return { ok: true, content: next.replaceAll('\n', eol), created: true, id: payload.id };
}
