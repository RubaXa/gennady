// @file: SddTaskCommand — CLI entry for gennady sdd-task: emit the ticket planning surface (Meta + phases + manifests + gates).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
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
import { isTicket, ticketRef, pickableTasks, type TicketRef } from '../../../shared/sdd/check.ts';
import { fileError, formatPlan, notATicket, type TaskOutcome } from './sdd-task.types.ts';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '__tests__']);

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

/** @purpose Render the execution map — tickets ready now and those still blocked, by which deps. | @param refs Every ticket's graph ref. | @returns A human + agent readable map. */
function formatMap(refs: TicketRef[]): string {
  const pickable = pickableTasks(refs);
  const pickableIds = new Set(pickable.map((r) => r.taskId));
  const doneIds = new Set(refs.filter((r) => /\bDONE\b/i.test(r.status ?? '')).map((r) => r.taskId));
  const blocked = refs.filter((r) => /\bTODO\b/i.test(r.status ?? '') && !pickableIds.has(r.taskId));
  const lines = [`[sdd-task] execution map — ${pickable.length} pickable, ${blocked.length} blocked`];
  lines.push(`pickable (ready now): ${pickable.map((r) => r.taskId).join(', ') || '— none'}`);
  for (const b of blocked) {
    const unmet = b.dependencies.filter((d) => !/^(none|n\/a|[—-])\b/i.test(d.trim()) && !doneIds.has(d));
    lines.push(`blocked: ${b.taskId} ← ${unmet.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * @purpose Execute gennady sdd-task — read only the planning sections of a ticket and emit the orchestrator's read surface.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns TaskOutcome — the planning surface on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<TaskOutcome> {
  const args = parseArgs(rawArgs, {});
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-task'
  );

  const ticket = positional[0];
  if (!ticket) {
    // No Task-ID → emit the execution map (deterministic pickable set from the trackers, not eyeballed).
    const refs: TicketRef[] = [];
    walkTickets(resolve('.'), refs);
    return { ok: true, text: formatMap(refs) };
  }

  let content: string;
  try {
    content = readFileSync(resolve(ticket), 'utf-8');
  } catch {
    return fileError(ticket);
  }

  const metaSec = extractSection(content, 'META');
  if (metaSec.status !== 'ok') return notATicket(ticket);

  const meta = parseMetaInfo(metaSec.content);

  const ovSec = extractSection(content, 'PHASES_OVERVIEW');
  const phases = ovSec.status === 'ok' ? parsePhasesOverview(ovSec.content) : [];

  const verSec = extractSection(content, 'VERIFICATION');
  const gates = verSec.status === 'ok' ? parseVerification(verSec.content) : [];

  // #region START_PHASE_DETAILS — invariant: extract only each phase's own section, never the whole body
  const detailsById: Record<string, PhaseDetail | undefined> = {};
  for (const p of phases) {
    const sec = extractSection(content, `PHASE_${p.id}`);
    if (sec.status === 'ok') detailsById[p.id] = parsePhaseDetail(sec.content);
  }
  // #endregion END_PHASE_DETAILS

  logger.debug(`[SddTaskCommand#run] ${meta.taskId ?? '?'}: ${phases.length} phase(s), ${gates.length} gate(s)`);
  return { ok: true, text: formatPlan(meta, phases, detailsById, gates) };
}

// Self-executing for CLI: gennady sdd-task <ticket-path>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
