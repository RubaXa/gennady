// @file: SddTaskCommand — CLI entry for gennady sdd-task: emit the ticket planning surface (Meta + phases + manifests + gates).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import {
  parseMetaInfo,
  parsePhasesOverview,
  parsePhaseDetail,
  parseVerification,
  type PhaseDetail,
} from '../../../shared/sdd/ticket.ts';
import {
  isTicket,
  ticketRef,
  pickableTasks,
  scanBlockerTrail,
  parsePhaseHandoffs,
  type TicketRef,
} from '../../../shared/sdd/check.ts';
import { checkReadiness, gatherReadinessInput } from '../../../shared/sdd/readiness.ts';
import { parseScopes } from '../../../shared/sdd/portal.ts';
import { looksLikeTaskId } from '../../../shared/sdd/task-id.ts';
import {
  fileError,
  formatPlan,
  formatPhase,
  notATicket,
  unknownIdError,
  ambiguousIdError,
  type TaskOutcome,
} from './sdd-task.types.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

/** @purpose Recursively collect every ticket's graph ref under a directory (the execution map's raw input). | @param dir Directory to walk. | @param acc TicketRef accumulator. */
function walkTickets(dir: string, acc: TicketRef[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkTickets(full, acc);
    else if (e.isFile() && e.name.endsWith('.md')) {
      let c: string;
      try {
        c = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      if (isTicket(c)) acc.push(ticketRef(full, c));
    }
  }
}

/**
 * @purpose Named infra-scope TODO tickets already building the missing gate scripts — the preflight gate's queue-exception signal.
 * @param refs Every ticket's graph ref (Task-ID, status, owning scope).
 * @param root Absolute project root — reads `package.json` and `specs/README.md`.
 * @returns Queued infra TODO Task-IDs when readiness is missing and the queue covers it; empty otherwise.
 */
function infraGateTicketIds(refs: TicketRef[], root: string): string[] {
  const readiness = checkReadiness(gatherReadinessInput(root));
  if (readiness.ready) return [];

  let portalContent: string;
  try {
    portalContent = readFileSync(join(root, 'specs', 'README.md'), 'utf-8');
  } catch {
    return [];
  }
  const infraScopeNames = new Set(
    parseScopes(portalContent)
      .filter((s) => s.type === 'infrastructure')
      .map((s) => s.name)
  );
  if (infraScopeNames.size === 0) return [];

  return refs
    .filter(
      (r) => r.taskId && /\bTODO\b/i.test(r.status ?? '') && r.scope && infraScopeNames.has(r.scope)
    )
    .map((r) => r.taskId as string);
}

/** @purpose Render the execution map — tickets ready now and those still blocked, by which deps.
 * @invariant Every pickable/blocked line carries the ticket's relative path, so the map is self-sufficient without a follow-up lookup.
 * @param refs Every ticket's graph ref. | @param root Absolute project root (readiness + portal reads). | @returns A human + agent readable map. */
function formatMap(refs: TicketRef[], root: string): string {
  const pickable = pickableTasks(refs);
  const pickableIds = new Set(pickable.map((r) => r.taskId));
  const doneIds = new Set(
    refs.filter((r) => /\bDONE\b/i.test(r.status ?? '')).map((r) => r.taskId)
  );
  const blocked = refs.filter(
    (r) => /\bTODO\b/i.test(r.status ?? '') && !pickableIds.has(r.taskId)
  );
  const relPath = (file: string): string => relative(root, file) || file;
  const lines = [
    `[sdd-task] execution map — ${pickable.length} pickable, ${blocked.length} blocked`,
    `root: ${root}`,
  ];
  if (pickable.length === 0) {
    lines.push('pickable (ready now): — none');
  } else {
    lines.push('pickable (ready now):');
    for (const r of pickable) lines.push(`  ${r.taskId} → ${relPath(r.file)}`);
  }
  for (const b of blocked) {
    const unmet = b.dependencies.filter(
      (d) => !/^(none|n\/a|[—-])\b/i.test(d.trim()) && !doneIds.has(d)
    );
    lines.push(`blocked: ${b.taskId} ← ${unmet.join(', ')}  →  ${relPath(b.file)}`);
  }
  const gateIds = infraGateTicketIds(refs, root);
  if (gateIds.length > 0) {
    lines.push(
      `гейты: отсутствуют · их строят тикеты очереди (${gateIds.join(', ')}) — для исполнения это штатно, начинай с них`
    );
  }
  lines.push(
    '',
    pickable.length
      ? 'next: возьми Task-ID из pickable и вызови `sdd-task <id>` за планом фаз.'
      : 'next: pickable пуст — разблокируй одну из blocked (закрой её зависимости), затем повтори.'
  );
  return lines.join('\n');
}

/** @purpose Result of resolving the CLI's ticket argument — loaded content (+ an optional resolution line) or a failure outcome. */
type ResolvedTicket =
  | { ok: true; content: string; resolutionLine: string | null }
  | { ok: false; outcome: TaskOutcome };

// Fixes the tool's own dead-end: the map hands out Task-IDs and its `next:` hint says to call
// `sdd-task <id>`, but `run()` used to treat every argument as a path — a bare id (e.g. `TDM-boot`)
// failed as file-not-found with no path to retry.
/**
 * @purpose Resolve the ticket argument to file content — a path (unchanged), or, when unreadable and
 * Task-ID-shaped, a scan-and-match by Meta Task-ID (AX_TASK_RESOLUTION).
 * @param ticket Raw CLI argument (a ticket path or a bare Task-ID).
 * @param root Absolute project root — scanned only when the direct path read fails and the argument looks like an id.
 * @returns Ticket content + a `[sdd-task] <id> → <path>` resolution line to prepend (null when a path was given directly), or a failure outcome.
 */
function resolveTicketArg(ticket: string, root: string): ResolvedTicket {
  const directPath = resolve(ticket);
  try {
    return { ok: true, content: readFileSync(directPath, 'utf-8'), resolutionLine: null };
  } catch {
    // Not a readable path — fall through to Task-ID resolution below.
  }

  if (!looksLikeTaskId(ticket)) return { ok: false, outcome: fileError(ticket) };

  const refs: TicketRef[] = [];
  walkTickets(root, refs);
  const matches = refs.filter((r) => r.taskId === ticket);

  if (matches.length === 0) return { ok: false, outcome: unknownIdError(ticket, refs) };
  if (matches.length > 1) return { ok: false, outcome: ambiguousIdError(ticket, matches, root) };

  const match = matches[0] as TicketRef;
  const matchPath = resolve(match.file);
  try {
    return {
      ok: true,
      content: readFileSync(matchPath, 'utf-8'),
      resolutionLine: `[sdd-task] ${ticket} → ${relative(root, matchPath)}`,
    };
  } catch {
    return { ok: false, outcome: fileError(ticket) };
  }
}

/** @purpose Prepend the bare-id resolution line to a successful outcome; pass everything else through unchanged. | @param outcome The formatted plan/phase outcome. | @param line The resolution line from `resolveTicketArg`, or null when a path was given directly. */
function withResolutionLine(outcome: TaskOutcome, line: string | null): TaskOutcome {
  if (!outcome.ok || !line) return outcome;
  return { ok: true, text: `${line}\n${outcome.text}` };
}

/**
 * @purpose Execute gennady sdd-task — read only the planning sections of a ticket and emit the orchestrator's read surface.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns TaskOutcome — the planning surface on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<TaskOutcome> {
  const args = parseArgs(rawArgs, { phase: { aliases: ['phase'], takesValue: true } });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-task'
  );
  const phaseId = typeof args.phase === 'string' ? args.phase : null;

  const ticket = positional[0];
  const root = resolve('.');
  if (!ticket) {
    // No Task-ID → emit the execution map (deterministic pickable set from the trackers, not eyeballed).
    const refs: TicketRef[] = [];
    walkTickets(root, refs);
    return { ok: true, text: formatMap(refs, root) };
  }

  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) return resolved.outcome;
  const { content, resolutionLine } = resolved;

  const metaSec = extractSection(content, 'META');
  if (metaSec.status !== 'ok') return notATicket(ticket);

  const meta = parseMetaInfo(metaSec.content);

  const ovSec = extractSection(content, 'PHASES_OVERVIEW');
  const phases = ovSec.status === 'ok' ? parsePhasesOverview(ovSec.content) : [];

  const verSec = extractSection(content, 'VERIFICATION');
  const gates = verSec.status === 'ok' ? parseVerification(verSec.content) : [];

  const logSec = extractSection(content, 'EXECUTION_LOG');
  const activeBlockers = logSec.status === 'ok' ? scanBlockerTrail(logSec.content) : [];
  const handoffs = logSec.status === 'ok' ? parsePhaseHandoffs(logSec.content) : {};

  // #region START_PHASE_DETAILS — invariant: extract only each phase's own section, never the whole body
  const detailsById: Record<string, PhaseDetail | undefined> = {};
  for (const p of phases) {
    const sec = extractSection(content, `PHASE_${p.id}`);
    if (sec.status === 'ok') detailsById[p.id] = parsePhaseDetail(sec.content);
  }
  // #endregion END_PHASE_DETAILS

  if (phaseId) {
    logger.debug(`[SddTaskCommand#run] ${meta.taskId ?? '?'}: --phase ${phaseId}`);
    return withResolutionLine(
      formatPhase(meta, phases, detailsById, gates, handoffs, phaseId),
      resolutionLine
    );
  }

  logger.debug(
    `[SddTaskCommand#run] ${meta.taskId ?? '?'}: ${phases.length} phase(s), ${gates.length} gate(s)`
  );
  return withResolutionLine(
    { ok: true, text: formatPlan(meta, phases, detailsById, gates, activeBlockers) },
    resolutionLine
  );
}

// Self-executing for CLI: gennady sdd-task <ticket-path|Task-ID>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
