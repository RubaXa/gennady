// @file: SddTaskCommand — CLI entry for gennady sdd-task: emit the ticket planning surface (Meta + phases + manifests + gates).
// @consumers: gennady.ts
// @tasks: N/A

import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, join, dirname, extname } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { extractSection, extractHeadingSection } from '../../../shared/sdd/section.ts';
import {
  parseMetaInfo,
  parsePhasesOverview,
  parsePhaseDetail,
  parseVerification,
  type PhaseDetail,
} from '../../../shared/sdd/ticket.ts';
import {
  pickableTasks,
  scanBlockerTrail,
  parsePhaseHandoffs,
  type TicketRef,
} from '../../../shared/sdd/check.ts';
import { checkReadiness, gatherReadinessInput } from '../../../shared/sdd/readiness.ts';
import { parseScopes } from '../../../shared/sdd/portal.ts';
import { queuedInfraGateTicketIds } from '../../../shared/sdd/gate-queue.ts';
import {
  collectTicketRefs,
  resolveTicketArg,
  resolutionLine as buildResolutionLine,
} from '../../../shared/sdd/ticket-resolve.ts';
import {
  resolveAuditGroup,
  ticketTargetFiles,
  ticketHandoffArtifacts,
} from '../../../shared/sdd/audit-group.ts';
import { hasGitHead, getChangedFiles } from '../../../shared/common/changed-files.ts';
import {
  fileError,
  formatPlan,
  formatPhase,
  notATicket,
  unknownIdError,
  ambiguousIdError,
  auditGroupError,
  formatAuditGroup,
  formatGroupScope,
  buildAuditGroupLine,
  type TaskOutcome,
  type GroupScopeGit,
} from './sdd-task.types.ts';

/**
 * @purpose Named infra-scope TODO tickets already building the missing gate scripts — the preflight gate's queue-exception signal.
 * @param refs Every ticket's graph ref (Task-ID, status, owning scope).
 * @param root Absolute project root — reads `package.json` and `specs/README.md`.
 * @returns Queued infra TODO Task-IDs when readiness is missing and the queue covers it; empty otherwise.
 */
function infraGateTicketIds(
  refs: TicketRef[],
  root: string,
  readiness: ReturnType<typeof checkReadiness>
): string[] {
  let portalContent: string;
  try {
    portalContent = readFileSync(join(root, 'specs', 'README.md'), 'utf-8');
  } catch {
    return [];
  }
  return queuedInfraGateTicketIds(refs, parseScopes(portalContent), readiness);
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
  const readiness = checkReadiness(gatherReadinessInput(root));
  const gateIds = infraGateTicketIds(refs, root, readiness);
  lines.push(`READINESS=${readiness.ready ? 'ready' : 'not-ready'}`);
  if (gateIds.length > 0) {
    lines.push(
      `GATE_QUEUE=${gateIds.join(',')} · гейты отсутствуют, их строят эти тикеты — для исполнения это штатно, начинай с них`
    );
  } else {
    lines.push('GATE_QUEUE=none');
  }
  lines.push(
    '',
    pickable.length
      ? 'next: возьми Task-ID из pickable и вызови `sdd-task <id>` за планом фаз.'
      : 'next: pickable пуст — разблокируй одну из blocked (закрой её зависимости), затем повтори.'
  );
  return lines.join('\n');
}

/** @purpose Prepend the bare-id resolution line to a successful outcome; pass everything else through unchanged. | @param outcome The formatted plan/phase outcome. | @param line The resolution line from `resolveTicketArg`, or null when a path was given directly. */
function withResolutionLine(outcome: TaskOutcome, line: string | null): TaskOutcome {
  if (!outcome.ok || !line) return outcome;
  return { ok: true, text: `${line}\n${outcome.text}` };
}

/**
 * @purpose Execute gennady sdd-task — read only the planning sections of a ticket and emit the orchestrator's read surface.
 * @invariant A sole positional naming an existing directory is the map's project root, not a ticket — a ticket never resolves to a directory.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @returns TaskOutcome — the planning surface on success, else an actionable failure.
 */
export async function run(rawArgs: string[]): Promise<TaskOutcome> {
  const args = parseArgs(rawArgs, {
    phase: { aliases: ['phase'], takesValue: true },
    auditGroup: { aliases: ['audit-group'], takesValue: true },
    groupScope: { aliases: ['group-scope'], takesValue: true },
    taskScope: { aliases: ['task-scope'], takesValue: true },
  });
  const positional = (args._ as string[]).filter(
    (a: string) => typeof a === 'string' && a !== 'sdd-task'
  );
  const phaseId = typeof args.phase === 'string' ? args.phase : null;
  const auditGroupArg = typeof args.auditGroup === 'string' ? args.auditGroup : null;
  const groupScopeArg = typeof args.groupScope === 'string' ? args.groupScope : null;
  const taskScopeArg = typeof args.taskScope === 'string' ? args.taskScope : null;

  const defaultRoot = resolve('.');

  if (auditGroupArg) {
    const resolution = resolveAuditGroup(auditGroupArg, defaultRoot);
    if (!resolution.ok) return auditGroupError(resolution, auditGroupArg, defaultRoot);
    return formatAuditGroup(resolution.specPath, resolution.group, resolution.allRefs, defaultRoot);
  }

  if (groupScopeArg || taskScopeArg) {
    const scopeArg = groupScopeArg ?? (taskScopeArg as string);
    const resolution = resolveAuditGroup(scopeArg, defaultRoot);
    if (!resolution.ok) return auditGroupError(resolution, scopeArg, defaultRoot);
    const singleTicket = taskScopeArg ? resolveTicketArg(taskScopeArg, defaultRoot) : null;
    const selectedGroup =
      singleTicket?.ok === true
        ? resolution.group.filter((ticket) => resolve(ticket.file) === resolve(singleTicket.path))
        : resolution.group;
    const targetFiles: string[] = [];
    const handoffArtifacts: string[] = [];
    const contractAnchors: string[] = [];
    for (const r of selectedGroup) {
      let groupTicketContent: string;
      try {
        groupTicketContent = readFileSync(r.file, 'utf-8');
      } catch {
        continue;
      }
      for (const f of ticketTargetFiles(groupTicketContent)) {
        if (!targetFiles.includes(f)) targetFiles.push(f);
      }
      for (const a of ticketHandoffArtifacts(groupTicketContent)) {
        if (!handoffArtifacts.includes(a)) handoffArtifacts.push(a);
      }
      const metaSection = extractSection(groupTicketContent, 'META');
      if (metaSection.status === 'ok') {
        for (const ref of parseMetaInfo(metaSection.content).specRefs) {
          const rawAnchor = ref.anchor || ref.name;
          const [rawPath, fragment] = rawAnchor.split('#', 2);
          const anchor = rawPath?.endsWith('.md')
            ? `${relative(defaultRoot, rawPath.startsWith('specs/') ? resolve(defaultRoot, rawPath) : resolve(dirname(r.file), rawPath))}${fragment ? `#${fragment}` : ''}`
            : rawAnchor;
          if (anchor && !contractAnchors.includes(anchor)) contractAnchors.push(anchor);
        }
      }
    }
    const targetRoots = new Set(targetFiles.map((file) => dirname(file)));
    const changedFiles = hasGitHead(defaultRoot)
      ? getChangedFiles(defaultRoot).filter(
          (file) =>
            !taskScopeArg ||
            [...targetRoots].some((root) => file === root || file.startsWith(`${root}/`))
        )
      : [];
    const git: GroupScopeGit = hasGitHead(defaultRoot)
      ? { available: true, files: changedFiles }
      : { available: false };
    const allFiles = [...new Set([...targetFiles, ...changedFiles])];
    const lintFiles = allFiles.filter((file) =>
      ['.ts', '.tsx', '.js', '.jsx'].includes(extname(file))
    );
    const candidateRoots = [...new Set(lintFiles.map((file) => dirname(file)))].sort(
      (left, right) => left.length - right.length
    );
    const codeRoots = candidateRoots.filter(
      (root, index) =>
        !candidateRoots.slice(0, index).some((parent) => root.startsWith(`${parent}/`))
    );
    return formatGroupScope(
      resolution.specPath,
      selectedGroup,
      defaultRoot,
      targetFiles,
      handoffArtifacts,
      git,
      contractAnchors,
      lintFiles,
      codeRoots
    );
  }

  const ticket = positional[0];
  if (!ticket) {
    // No Task-ID → emit the execution map (deterministic pickable set from the trackers, not eyeballed).
    return { ok: true, text: formatMap(collectTicketRefs(defaultRoot), defaultRoot) };
  }

  // A bare positional naming an existing directory is a map-mode project root, not a ticket —
  // gives `sdd-task [project-root]` the same shape as `sdd-state [project-root]`.
  let ticketArgIsDir = false;
  try {
    ticketArgIsDir = statSync(resolve(ticket)).isDirectory();
  } catch {
    // not a directory (or doesn't exist) — fall through to ticket resolution below
  }
  if (ticketArgIsDir) {
    const altRoot = resolve(ticket);
    return { ok: true, text: formatMap(collectTicketRefs(altRoot), altRoot) };
  }

  const root = defaultRoot;
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    if (resolved.reason === 'unreadable') return fileError(ticket);
    if (resolved.reason === 'unknown-id') return unknownIdError(ticket, resolved.refs);
    return ambiguousIdError(ticket, resolved.matches, root);
  }
  const { content } = resolved;
  const resolutionLine =
    resolved.resolvedFrom === 'id'
      ? buildResolutionLine('sdd-task', resolved.id, resolved.path, root)
      : null;

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
    // `## Audit Rounds` is a plain heading section (TICKET_AUDIT_ROUND_FORMAT), not a
    // <!--SECTION:...--> anchor — the fix-worker needs its findings' bodies, not just the `fix:
    // F-NNN` tag, so it stops grepping the repo for what the audit actually found.
    const auditSec = extractHeadingSection(content, 'audit-rounds');
    const auditRounds = auditSec.status === 'ok' ? auditSec.content : null;
    return withResolutionLine(
      formatPhase(meta, phases, detailsById, gates, handoffs, phaseId, auditRounds),
      resolutionLine
    );
  }

  logger.debug(
    `[SddTaskCommand#run] ${meta.taskId ?? '?'}: ${phases.length} phase(s), ${gates.length} gate(s)`
  );
  // audit-group context — best-effort: a ticket whose filename doesn't follow the v2 `.task.` naming
  // convention (or whose owning spec is missing) simply omits the line, never fails the plan.
  const groupRes = resolveAuditGroup(ticket, root);
  const auditGroupLine = groupRes.ok
    ? buildAuditGroupLine(groupRes.specPath, groupRes.group, root)
    : null;
  return withResolutionLine(
    {
      ok: true,
      text: formatPlan(meta, phases, detailsById, gates, activeBlockers, auditGroupLine),
    },
    resolutionLine
  );
}

// Self-executing for CLI: gennady sdd-task <ticket-path|Task-ID>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
