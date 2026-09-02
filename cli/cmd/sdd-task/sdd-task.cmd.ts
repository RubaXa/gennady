// @file: SddTaskCommand — CLI entry for gennady sdd-task: emit the ticket planning surface (Meta + phases + manifests + gates).
// @consumers: gennady.ts
// @tasks: N/A

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, join, dirname } from 'node:path';
import { logger } from '#logger';
import { parseArgs } from '../../../shared/common/parse-args.ts';
import { extractSection, extractHeadingSection } from '../../../shared/sdd/section.ts';
import {
  parseMetaInfo,
  parsePhasesOverview,
  parsePhaseDetail,
  parseVerificationTable,
  parseTicketCoveragePolicy,
  type PhaseDetail,
} from '../../../shared/sdd/ticket.ts';
import { pickableTasks, scanBlockerTrail, parsePhaseHandoffs } from '../../../shared/sdd/check.ts';
import { checkReadiness, gatherReadinessInput } from '../../../shared/sdd/readiness.ts';
import { parseScopes } from '../../../shared/sdd/portal.ts';
import {
  phaseOwnsMissingReadinessGate,
  queuedInfraGateTicketIds,
  type GateQueueResult,
} from '../../../shared/sdd/gate-queue.ts';
import {
  collectTicketCorpus,
  resolveTicketArg,
  resolutionLine as buildResolutionLine,
  type TicketCorpusRef,
} from '../../../shared/sdd/ticket-resolve.ts';
import {
  boundGroupChangedFiles,
  resolveAuditGroup,
  validateTicketReviewPaths,
  validateTicketTargetClaims,
} from '../../../shared/sdd/audit-group.ts';
import { getChangedFiles } from '../../../shared/common/changed-files.ts';
import { checkPhaseDependencies } from '../../../shared/sdd/phase-dependencies.ts';
import { appendSddSessionBoundary } from '../../../shared/sdd/session-boundary.ts';
import { normalizeSddToolFailure } from '../../../shared/sdd/tool-guidance.ts';
import { phaseReceiptIssue } from '../sdd-verify/phase-receipt-validation.ts';
import { isGennadyLintTarget } from '../lint/lint-source-policy.ts';
import {
  phaseVerificationArtifactPaths,
  resolvePhaseVerificationPlan,
} from '../../../shared/sdd/phase-verification-plan.ts';
import {
  fileError,
  formatPlan,
  formatPhase,
  phaseNotFound,
  notATicket,
  unknownIdError,
  ambiguousIdError,
  auditGroupError,
  infraNotReadyError,
  infraExemptionLine,
  dependencyNotReadyError,
  verificationTableError,
  scopeEvidenceError,
  phaseEvidenceError,
  ticketCorpusError,
  badInvocation,
  formatAuditGroup,
  formatGroupScope,
  buildAuditGroupLine,
  type TaskOutcome,
  type GroupScopeGit,
  type CoverageGate,
} from './sdd-task.types.ts';

/**
 * @purpose Named infra-scope TODO tickets already building the missing gate scripts, plus queue diagnostics.
 * @param refs Every ticket's graph ref (Task-ID, status, owning scope).
 * @param root Absolute project root — reads `package.json` and `specs/README.md`.
 * @returns Queued infra TODO Task-IDs and fail-closed diagnostics.
 */
function infraGateQueue(
  refs: TicketCorpusRef[],
  root: string,
  readiness: ReturnType<typeof checkReadiness>
): GateQueueResult {
  let portalContent: string;
  try {
    portalContent = readFileSync(join(root, 'specs', 'README.md'), 'utf-8');
  } catch (cause) {
    return {
      ticketIds: [],
      owners: [],
      diagnostics: [
        {
          kind: 'gate-contract-missing',
          message: `portal/GATE_QUEUE cannot be resolved: ${cause instanceof Error ? cause.message : String(cause)}`,
        },
      ],
    };
  }
  return queuedInfraGateTicketIds(refs, parseScopes(portalContent), readiness, root);
}

/** @purpose Render the execution map — tickets ready now and those still blocked, by which deps.
 * @invariant Every pickable/blocked line carries the ticket's relative path, so the map is self-sufficient without a follow-up lookup.
 * @param refs Every ticket's graph ref. | @param root Absolute project root (readiness + portal reads). | @returns A human + agent readable map. */
function formatMap(refs: TicketCorpusRef[], root: string): string {
  const canonicalRoot = realpathSync(root);
  const readiness = checkReadiness(gatherReadinessInput(canonicalRoot));
  const gateQueue = infraGateQueue(refs, canonicalRoot, readiness);
  const graphPickable = pickableTasks(refs);
  const gateTicketFiles = new Set(gateQueue.owners.map((owner) => owner.ticketFile));
  const doneIds = new Set(
    refs.filter((r) => /\bDONE\b/i.test(r.status ?? '')).map((r) => r.taskId)
  );
  const queuePickable = refs.filter(
    (ref) =>
      gateTicketFiles.has(ref.file) &&
      !/\bDONE\b/i.test(ref.status ?? '') &&
      ref.dependencies.every(
        (dependency) =>
          /^(?:none|n\/a)\b|^[—-]$/i.test(dependency.trim()) || doneIds.has(dependency)
      )
  );
  const pickable = readiness.executionReady ? graphPickable : queuePickable;
  const pickableIds = new Set(pickable.map((r) => r.taskId));
  const graphPickableIds = new Set(graphPickable.map((r) => r.taskId));
  const blocked = refs.filter(
    (r) => /\bTODO\b/i.test(r.status ?? '') && !pickableIds.has(r.taskId)
  );
  const relPath = (file: string): string => relative(canonicalRoot, file) || file;
  const lines = [
    `[sdd-task] execution map — ${pickable.length} pickable, ${blocked.length} blocked`,
    `root: ${canonicalRoot}`,
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
    if (!readiness.executionReady && graphPickableIds.has(b.taskId))
      unmet.push('EXECUTION_READY=no');
    lines.push(`blocked: ${b.taskId} ← ${unmet.join(', ')}  →  ${relPath(b.file)}`);
  }
  lines.push(
    readiness.level === 'provisional'
      ? `READINESS=provisional (stubs: ${readiness.stubbed.join(', ')} — impl/refactor/test-фазы заблокированы, начинай с infra-очереди)`
      : `READINESS=${readiness.level}`
  );
  lines.push(`EXECUTION_READY=${readiness.executionReady ? 'yes' : 'no'}`);
  if (gateQueue.ticketIds.length > 0) {
    lines.push(
      `GATE_QUEUE=${gateQueue.ticketIds.join(',')} · гейты отсутствуют, их строят эти тикеты — для исполнения это штатно, начинай с них`
    );
  } else {
    lines.push('GATE_QUEUE=none');
  }
  for (const d of gateQueue.diagnostics) {
    lines.push(`GATE_QUEUE_DIAG: ${d.message}`);
  }
  const needsScaffold = gateQueue.diagnostics.some(
    (diagnostic) => diagnostic.kind === 'infra-spec-no-tickets'
  );
  lines.push(
    '',
    pickable.length
      ? readiness.executionReady
        ? 'next: возьми Task-ID из pickable и вызови `sdd-task <id>` за планом фаз.'
        : 'next: возьми Task-ID из GATE_QUEUE/pickable и вызови `sdd-task <id>` за bootstrap-планом.'
      : needsScaffold
        ? 'next: bootstrap-тикетов ещё нет — запусти `/sdd-scaffold` по готовым спецификациям.'
        : blocked.length > 0
          ? 'next: pickable пуст — разблокируй одну из blocked (закрой её зависимости), затем повтори.'
          : 'next: активных TODO-тикетов нет — вызови `sdd-state` для следующего шага.'
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
 * @param [projectRoot] Canonical ticket-resolution root; defaults to cwd (injectable for isolated tests).
 * @returns TaskOutcome — the planning surface on success, else an actionable failure.
 */
async function runCommand(rawArgs: string[], projectRoot: string): Promise<TaskOutcome> {
  let args: Record<string, unknown> & { _: string[] };
  try {
    args = parseArgs(
      rawArgs,
      {
        phase: { aliases: ['phase'], takesValue: true },
        auditGroup: { aliases: ['audit-group'], takesValue: true },
        groupScope: { aliases: ['group-scope'], takesValue: true },
        taskScope: { aliases: ['task-scope'], takesValue: true },
      },
      { strict: true }
    );
  } catch (cause) {
    return badInvocation(cause instanceof Error ? cause.message : String(cause));
  }
  const parsedPositionals = args._ as string[];
  const positional =
    parsedPositionals[0] === 'sdd-task' ? parsedPositionals.slice(1) : parsedPositionals;
  const invalidValue = [
    ['--phase', args.phase],
    ['--audit-group', args.auditGroup],
    ['--group-scope', args.groupScope],
    ['--task-scope', args.taskScope],
  ].find(([, value]) => value !== undefined && (typeof value !== 'string' || value.length === 0));
  if (invalidValue) return badInvocation(`${invalidValue[0]} requires exactly one value`);

  const phaseId = typeof args.phase === 'string' ? args.phase : null;
  const auditGroupArg = typeof args.auditGroup === 'string' ? args.auditGroup : null;
  const groupScopeArg = typeof args.groupScope === 'string' ? args.groupScope : null;
  const taskScopeArg = typeof args.taskScope === 'string' ? args.taskScope : null;
  const groupModes = [auditGroupArg, groupScopeArg, taskScopeArg].filter(Boolean);
  if (groupModes.length > 1) return badInvocation('choose only one group mode');
  if (phaseId && groupModes.length > 0)
    return badInvocation('--phase cannot be combined with a group mode');
  if (groupModes.length > 0 && positional.length > 0)
    return badInvocation(`unexpected positional argument(s): ${positional.join(' ')}`);
  if (phaseId && positional.length !== 1)
    return badInvocation('--phase requires exactly one ticket path or Task-ID');
  if (!phaseId && groupModes.length === 0 && positional.length > 1)
    return badInvocation(`unexpected positional argument(s): ${positional.slice(1).join(' ')}`);

  const defaultRoot = resolve(projectRoot);

  if (auditGroupArg) {
    const resolution = resolveAuditGroup(auditGroupArg, defaultRoot);
    if (!resolution.ok) return auditGroupError(resolution, auditGroupArg, defaultRoot);
    return formatAuditGroup(resolution.specPath, resolution.group, resolution.allRefs, defaultRoot);
  }

  if (groupScopeArg || taskScopeArg) {
    const scopeArg = groupScopeArg ?? (taskScopeArg as string);
    const resolution = resolveAuditGroup(scopeArg, defaultRoot);
    if (!resolution.ok) return auditGroupError(resolution, scopeArg, defaultRoot);
    const selectedGroup = taskScopeArg
      ? resolution.group.filter((ticket) => resolve(ticket.file) === resolution.ticketPath)
      : resolution.group;
    if (selectedGroup.length === 0)
      return scopeEvidenceError(
        'the resolved ticket is absent from its own exact owning-spec group'
      );
    const targetFiles: string[] = [];
    const handoffArtifacts: string[] = [];
    const contractAnchors: string[] = [];
    const coverageGates: CoverageGate[] = [];
    for (const r of selectedGroup) {
      const groupTicketContent = resolution.ticketContents.get(resolve(r.file));
      if (groupTicketContent === undefined)
        return scopeEvidenceError(
          `${relative(defaultRoot, r.file)} disappeared from the ticket snapshot`
        );
      const verification = extractSection(groupTicketContent, 'VERIFICATION');
      const verificationTable =
        verification.status === 'ok'
          ? parseVerificationTable(verification.content)
          : parseVerificationTable('');
      if (!verificationTable.ok) return verificationTableError(r.file, verificationTable.issues);
      const coverage =
        verification.status === 'ok'
          ? parseTicketCoveragePolicy(verification.content)
          : { status: 'legacy' as const };
      coverageGates.push({ taskId: r.taskId ?? '(no-id)', ...coverage });
      const reviewPaths = validateTicketReviewPaths(defaultRoot, groupTicketContent);
      if (!reviewPaths.ok)
        return scopeEvidenceError(
          `${relative(defaultRoot, r.file)} declares invalid path \`${reviewPaths.path}\`: ${reviewPaths.detail}`
        );
      for (const f of [...reviewPaths.paths.targets, ...reviewPaths.paths.deleted]) {
        if (!targetFiles.includes(f)) targetFiles.push(f);
      }
      for (const a of reviewPaths.paths.handoffs) {
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
    const changedScan = getChangedFiles(defaultRoot);
    if (changedScan.status === 'error')
      return scopeEvidenceError(
        `git ${changedScan.operation} failed (exit ${changedScan.exitCode ?? 'spawn'}): ${changedScan.stderr || 'no stderr'}`
      );
    const gitChangedFiles = changedScan.files;
    const allTicketTargets = new Map<string, string[]>();
    if (!taskScopeArg) {
      for (const ticket of resolution.allRefs) {
        const content = resolution.ticketContents.get(resolve(ticket.file));
        if (content === undefined)
          return scopeEvidenceError(
            `${relative(defaultRoot, ticket.file)} disappeared from the ticket snapshot`
          );
        const claims = validateTicketTargetClaims(defaultRoot, content);
        if (!claims.ok)
          return scopeEvidenceError(
            `${relative(defaultRoot, ticket.file)} declares invalid path \`${claims.path}\`: ${claims.detail}`
          );
        allTicketTargets.set(ticket.file, claims.targets);
      }
    }
    const changedFiles = taskScopeArg
      ? gitChangedFiles.filter((file) =>
          [...targetRoots].some((root) => file === root || file.startsWith(`${root}/`))
        )
      : boundGroupChangedFiles(
          defaultRoot,
          gitChangedFiles,
          resolution.specPath,
          selectedGroup,
          targetFiles,
          allTicketTargets
        );
    const git: GroupScopeGit = {
      baseline: changedScan.status === 'ok' ? 'head' : 'empty-tree',
      files: changedFiles,
    };
    const allFiles = [...new Set([...targetFiles, ...changedFiles])];
    const lintFiles = allFiles.filter(
      (file) => existsSync(resolve(defaultRoot, file)) && isGennadyLintTarget(file)
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
      codeRoots,
      coverageGates
    );
  }

  const ticket = positional[0];
  if (!ticket) {
    // No Task-ID → emit the execution map (deterministic pickable set from the trackers, not eyeballed).
    const corpus = collectTicketCorpus(defaultRoot);
    return corpus.ok
      ? { ok: true, text: formatMap(corpus.refs, defaultRoot) }
      : ticketCorpusError(defaultRoot, corpus.detail);
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
    const corpus = collectTicketCorpus(altRoot);
    return corpus.ok
      ? { ok: true, text: formatMap(corpus.refs, altRoot) }
      : ticketCorpusError(altRoot, corpus.detail);
  }

  const root = defaultRoot;
  const resolved = resolveTicketArg(ticket, root);
  if (!resolved.ok) {
    if (resolved.reason === 'unreadable') return fileError(ticket);
    if (resolved.reason === 'unsafe-path' || resolved.reason === 'unsafe-corpus') {
      return fileError(`${ticket} (${resolved.detail})`);
    }
    if (resolved.reason === 'unknown-id') return unknownIdError(ticket, resolved.refs);
    if (resolved.reason === 'ambiguous-id') return ambiguousIdError(ticket, resolved.matches, root);
    return fileError(ticket);
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
  const verificationTable =
    verSec.status === 'ok' ? parseVerificationTable(verSec.content) : parseVerificationTable('');
  if (!verificationTable.ok) return verificationTableError(resolved.path, verificationTable.issues);
  const gates = verificationTable.gates;

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
    if (!phases.some((phase) => phase.id === phaseId)) {
      return withResolutionLine(phaseNotFound(phaseId, phases), resolutionLine);
    }
    const phaseIndex = phases.findIndex((phase) => phase.id === phaseId);
    const phasePaths = validateTicketReviewPaths(root, content, {
      phaseIds: [phaseId],
      targetExpectation: 'dispatch',
      deletedPhaseIds: phases.slice(0, phaseIndex + 1).map((phase) => phase.id),
      handoffPhaseIds: phases.slice(0, phaseIndex).map((phase) => phase.id),
    });
    if (!phasePaths.ok) {
      return phaseEvidenceError(
        `${relative(root, resolved.path)} declares invalid path \`${phasePaths.path}\`: ${phasePaths.detail}`
      );
    }
    const dependencyIssue = checkPhaseDependencies(content, phaseId, (receipt, dependencyPhase) =>
      phaseReceiptIssue(root, receipt, dependencyPhase, resolved.path)
    );
    if (dependencyIssue) return dependencyNotReadyError(phaseId, dependencyIssue);
    let infraExemptionNote: string | null = null;
    // Execution gate: an impl/refactor/test phase on stub (or absent) verification infrastructure
    // would sail through sdd-verify without a single real check — refuse before any work starts.
    // Allow-list, never a deny-list: `kind` is free text from the Phases Overview cell with no
    // vocabulary validation, so an unknown spelling (`implementation`, or the execution-time `fix`
    // kind, which writes production code) must fall on the GATED side, not slip through.
    const phaseKind = phases.find((p) => p.id === phaseId)?.kind?.toLowerCase() ?? '';
    const UNGATED_KINDS = ['bootstrap', 'config', 'doc'];
    if (!UNGATED_KINDS.includes(phaseKind)) {
      const readiness = checkReadiness(gatherReadinessInput(root));
      if (!readiness.executionReady) {
        // The infra tickets BUILDING the missing gates are exempt — they are the way out of this
        // state, and blocking them would deadlock the flow against its own remedy (an infra ticket
        // that authors a `.ts` gets impl+test phases, since impl and test never share a phase).
        // Same queue the execution map prints as GATE_QUEUE, so the exemption needs no new field.
        const corpus = collectTicketCorpus(root);
        if (!corpus.ok) return ticketCorpusError(root, corpus.detail);
        const queue = infraGateQueue(corpus.refs, root, readiness);
        if (!meta.taskId || !phaseOwnsMissingReadinessGate(queue, meta.taskId, phaseId)) {
          return infraNotReadyError(
            phaseId,
            phaseKind,
            readiness.level,
            readiness.level === 'provisional' ? readiness.stubbed : readiness.missing
          );
        }
        logger.debug(
          `[SddTaskCommand#run] ${meta.taskId}: infra-queue exemption — ${phaseKind} phase runs at readiness=${readiness.level}`
        );
        infraExemptionNote = infraExemptionLine(
          readiness.level,
          readiness.level === 'provisional' ? readiness.stubbed : readiness.missing
        );
      }
    }
    // `## Audit Rounds` is a plain heading section (TICKET_AUDIT_ROUND_FORMAT), not a
    // <!--SECTION:...--> anchor — the fix-worker needs its findings' bodies, not just the `fix:
    // F-NNN` tag, so it stops grepping the repo for what the audit actually found.
    const auditSec = extractHeadingSection(content, 'audit-rounds');
    const auditRounds = auditSec.status === 'ok' ? auditSec.content : null;
    const corpus = collectTicketCorpus(root);
    if (!corpus.ok) return ticketCorpusError(root, corpus.detail);
    let scripts: Record<string, string> = {};
    try {
      scripts =
        (
          JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
            scripts?: Record<string, string>;
          }
        ).scripts ?? {};
    } catch {
      scripts = {};
    }
    const verificationPlan = resolvePhaseVerificationPlan({
      refs: corpus.refs,
      ticketFile: resolved.path,
      phaseId,
      scripts,
      availableArtifacts: new Set(
        phaseVerificationArtifactPaths().filter((path) => existsSync(join(root, path)))
      ),
      mode: 'runtime',
    });
    const phaseOutcome = formatPhase(
      meta,
      phases,
      detailsById,
      gates,
      handoffs,
      phaseId,
      auditRounds,
      {
        readFiles: phasePaths.paths.targets.filter(
          (target) => !phasePaths.paths.createTargets.includes(target)
        ),
        createFiles: phasePaths.paths.createTargets,
      },
      verificationPlan ?? undefined
    );
    return withResolutionLine(
      infraExemptionNote && phaseOutcome.ok
        ? { ok: true, text: `${infraExemptionNote}\n${phaseOutcome.text}` }
        : phaseOutcome,
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
    ? buildAuditGroupLine(groupRes.specPath, groupRes.group, root, meta.taskId ?? ticket)
    : null;
  return withResolutionLine(
    {
      ok: true,
      text: formatPlan(meta, phases, detailsById, gates, activeBlockers, auditGroupLine),
    },
    resolutionLine
  );
}

/**
 * @purpose Execute sdd-task and append the mandatory workspace boundary to every successful state surface.
 * @param rawArgs Raw command-line arguments (process.argv).
 * @param [projectRoot] Canonical ticket-resolution and worker root; defaults to cwd.
 * @returns Planning state ending with WORKING_DIR/TMP_DIR, or the original actionable failure.
 */
export async function run(rawArgs: string[], projectRoot = resolve('.')): Promise<TaskOutcome> {
  const root = resolve(projectRoot);
  const outcome = await runCommand(rawArgs, root);
  if (outcome.ok) return { ok: true, text: appendSddSessionBoundary(outcome.text, root) };
  return {
    ...outcome,
    message: normalizeSddToolFailure(
      {
        tool: 'sdd-task',
        code: outcome.code,
        object: rawArgs.slice(2).join(' ') || projectRoot,
        action: 'repair the named ticket or phase evidence, then repeat the same state query',
        example: 'npx gennady sdd-task specs/demo/core/core.task.DEM-work.md --phase P1',
      },
      outcome.message
    ),
  };
}

// Self-executing for CLI: gennady sdd-task <ticket-path|Task-ID>
const outcome = await run(process.argv);
console.log(outcome.ok ? outcome.text : outcome.message);
process.exit(outcome.ok ? 0 : outcome.exitCode);
