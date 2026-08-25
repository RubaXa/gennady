// @file: Types, error codes, and planning-surface formatting for the sdd-task command.
// @consumers: SddTaskCommand
// @tasks: N/A

import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { MetaInfo, PhaseOverview, PhaseDetail, Gate } from '../../../shared/sdd/ticket.ts';
import type { TicketRef } from '../../../shared/sdd/check.ts';
import { unreadableTicketHint } from '../../../shared/sdd/ticket-resolve.ts';
import type { AuditGroupResolution } from '../../../shared/sdd/audit-group.ts';

/**
 * @purpose Realpath a path when possible — resolves symlinks (macOS `/var` → `/private/var`) so
 *   differently-spelled paths to the same directory compare equal.
 * @param p A file or directory path.
 * @returns The realpath'd absolute path, or the plain resolved one when realpath fails (e.g. missing).
 */
function canonical(p: string): string {
  try {
    return realpathSync(resolve(p));
  } catch {
    return resolve(p);
  }
}

/**
 * @purpose Symlink-safe `relative(root, path)` — group paths derive from the raw ticket argument,
 *   not from `root`, so a plain string relative() can go wrong.
 * @param root Absolute project root.
 * @param p The path to relativize.
 * @returns The relative path, or `p` itself when it falls outside `root`'s tree (empty result).
 */
function groupRelative(root: string, p: string): string {
  return relative(canonical(root), canonical(p)) || p;
}

/** @purpose No ticket path was passed. */
export const ERR_CLI_SDD_TASK_BAD_INVOCATION = 'ERR_CLI_SDD_TASK_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_TASK_FILE = 'ERR_CLI_SDD_TASK_FILE' as const;
/** @purpose File has no META section — not a ticket. */
export const ERR_CLI_SDD_TASK_NOT_A_TICKET = 'ERR_CLI_SDD_TASK_NOT_A_TICKET' as const;
/** @purpose --phase named a phase id with no row in Phases Overview. */
export const ERR_CLI_SDD_TASK_PHASE_NOT_FOUND = 'ERR_CLI_SDD_TASK_PHASE_NOT_FOUND' as const;
/** @purpose Argument has Task-ID shape but no ticket in the tree carries that Meta Task-ID. */
export const ERR_CLI_SDD_TASK_UNKNOWN_ID = 'ERR_CLI_SDD_TASK_UNKNOWN_ID' as const;
/** @purpose More than one ticket carries the same Meta Task-ID (a project-wide collision). */
export const ERR_CLI_SDD_TASK_AMBIGUOUS_ID = 'ERR_CLI_SDD_TASK_AMBIGUOUS_ID' as const;
/** @purpose --audit-group/--group-scope argument resolved to a ticket whose filename isn't `<name>.task.<ID>.md` — no owning spec can be derived. */
export const ERR_CLI_SDD_TASK_NOT_V2_TICKET_NAME = 'ERR_CLI_SDD_TASK_NOT_V2_TICKET_NAME' as const;
/** @purpose The owning spec derived from the ticket's filename convention does not exist on disk. */
export const ERR_CLI_SDD_TASK_SPEC_MISSING = 'ERR_CLI_SDD_TASK_SPEC_MISSING' as const;
/** @purpose --phase targets an impl/refactor/test phase while the project's verification infrastructure is stubs or missing — the phase would run against gates that verify nothing. */
export const ERR_CLI_SDD_TASK_INFRA_NOT_READY = 'ERR_CLI_SDD_TASK_INFRA_NOT_READY' as const;

/**
 * @purpose Result of one sdd-task run.
 * @invariant On success `text` is the planning surface; on failure `message` is never empty.
 */
export type TaskOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

/**
 * @purpose Reduce a rule link/path to its rule-id (basename without .xml), for matching Verification rows.
 * @param rulePath Rule link target or path.
 * @returns The basename with any `.xml` stripped.
 */
export function ruleId(rulePath: string): string {
  const base = rulePath.split('/').pop() ?? rulePath;
  return base.replace(/\.xml$/, '').trim();
}

/** @purpose Select the gates a phase must run — those whose Required-by overlaps the phase's rule-ids. */
function gatesForPhase(detail: PhaseDetail, gates: Gate[]): Gate[] {
  const ids = new Set(detail.rules.map(ruleId));
  return gates.filter((g) => g.requiredBy.some((r) => ids.has(r)));
}

/**
 * @purpose Format the planning surface the orchestrator reads instead of the whole ticket.
 * @invariant Emits per-phase read-manifests (rules / specs / ticket sections / files / gates) plus an explicit DO-NOT-READ — never phase bodies or code.
 * @param meta Parsed Meta planning fields.
 * @param phases Phases Overview rows.
 * @param detailsById Parsed phase bodies keyed by phase id (missing → omitted manifest detail).
 * @param gates All Verification gates.
 * @param [activeBlockers] Unresolved 🛑 BLOCKED line texts (shared/sdd/check.ts#scanBlockerTrail), oldest first; default empty.
 * @param [auditGroupLine] Precomputed `audit-group: <spec path> (<closed>/<total>)` line, or null when the ticket's filename doesn't resolve to an owning spec.
 * @returns The formatted planning-surface text.
 */
export function formatPlan(
  meta: MetaInfo,
  phases: PhaseOverview[],
  detailsById: Record<string, PhaseDetail | undefined>,
  gates: Gate[],
  activeBlockers: string[] = [],
  auditGroupLine: string | null = null
): string {
  const lines: string[] = [];
  lines.push(`[sdd-task] ${meta.taskId ?? '<unknown>'} — ${meta.status ?? '<no status>'}`);
  if (meta.purpose) lines.push(`Purpose: ${meta.purpose}`);
  lines.push(`Scope/Module: ${meta.scope ?? '—'} / ${meta.module ?? '—'}`);
  lines.push(`Dependencies: ${meta.dependencies.length ? meta.dependencies.join(', ') : 'none'}`);
  if (auditGroupLine) lines.push(auditGroupLine);
  if (meta.specRefs.length) {
    lines.push('Spec References:');
    for (const s of meta.specRefs) {
      lines.push(`  - ${s.role ? `${s.role}: ` : ''}${s.name}${s.anchor ? ` (${s.anchor})` : ''}`);
    }
  }

  lines.push('', 'Phases Overview:');
  for (const p of phases) {
    lines.push(
      `  ${p.id} ${p.kind}  deps=${p.deps.length ? p.deps.join(',') : '—'}  status=${p.status}`
    );
  }

  lines.push('', 'Per-phase read-manifest (AX_READ_PER_MANIFEST):');
  const specAnchors = meta.specRefs.map((s) => s.anchor || s.name).filter(Boolean);
  for (const p of phases) {
    const d = detailsById[p.id];
    lines.push('', `▸ ${p.id} — ${p.kind}  ${p.status}`);
    if (!d) {
      lines.push('  (phase section missing — scaffold/repair before dispatch)');
      continue;
    }
    if (d.objective) lines.push(`  objective:   ${d.objective}`);
    lines.push(`  READ rules:  ${d.rules.length ? d.rules.join(', ') : '—'}`);
    lines.push(`  READ specs:  ${specAnchors.length ? specAnchors.join(', ') : '—'}`);
    lines.push(`  READ ticket: PHASE_${p.id}, BDD, VERIFICATION`);
    lines.push(`  READ files:  ${d.targetFiles.length ? d.targetFiles.join(', ') : '—'}`);
    const pg = gatesForPhase(d, gates);
    lines.push(`  gates:       ${pg.length ? pg.map((g) => g.command).join(' · ') : '—'}`);
    lines.push(`  inputs:      ${d.inputs ?? 'none'}`);
    lines.push(`  exit:        ${d.exit ?? '—'}`);
    lines.push(
      '  DO NOT READ: other phase bodies · code outside READ files · specs beyond the anchors above'
    );
  }

  if (gates.length) {
    lines.push('', 'Gates (all):');
    for (const g of gates) lines.push(`  ${g.command}  ← ${g.requiredBy.join(', ') || '—'}`);
  }

  lines.push('', '[BLOCKERS]');
  if (activeBlockers.length === 0) {
    lines.push('blockers: none');
  } else {
    lines.push(`blockers: ACTIVE ${activeBlockers.length}`);
    for (const b of activeBlockers) lines.push(`- ${b}`);
  }

  // This trailing line is orchestrator guidance, not part of the per-phase read-manifest above —
  // the orchestrator pastes each `▸ <phase>` block verbatim into a worker's dispatch prompt, never
  // this whole output, so a line down here never reaches a worker's context.
  lines.push(
    '',
    activeBlockers.length === 0
      ? 'next: открой тикет, исполняй фазы по протоколу (phase-execution-protocol), по одной, в порядке deps.'
      : 'next: сначала разбери активные блокеры с оператором — фазы не запускать, пока список не пуст.'
  );

  return lines.join('\n');
}

/**
 * @purpose One-line "how to satisfy" hint for a gate command, matched by keyword.
 * @param command The resolved gate command (e.g. `npm run type-check`).
 * @returns A short imperative hint — never the empty string.
 */
export function gateHint(command: string): string {
  if (/\byagni\b/.test(command))
    return 'run it; a single-use symbol needs a Usage Waiver or removal';
  if (/type-?check|\btsc\b/.test(command)) return 'run it; fix every reported type error';
  if (/\blint\b/.test(command)) return 'run it; fix every reported lint finding';
  if (/test:coverage|\btest\b/.test(command)) return 'run it; make every failing/missing test pass';
  if (/\bformat\b/.test(command)) return 'run it; commit the auto-formatted result';
  if (/sdd-check/.test(command)) return 'run it; fix every reported finding';
  return 'run it; it must exit 0';
}

/**
 * @purpose Format the compact single-phase context — objective, gates with a satisfy-hint, exit,
 * a phase-scoped read-manifest, and prior phases' verbatim Handoff lines.
 * @invariant `READ specs` uses the phase's own `Spec Refs` when declared, else the whole Meta Spec References.
 * @invariant Shown only for earlier `[x]`-checked phases; one with no captured Handoff says so,
 *   never a silent omission.
 * @param meta Parsed Meta planning fields.
 * @param phases Phases Overview rows.
 * @param detailsById Parsed phase bodies keyed by phase id.
 * @param gates All Verification gates.
 * @param handoffs Phase id → its verbatim `**Handoff →**` line (`parsePhaseHandoffs`).
 * @param phaseId The requested phase id (e.g. `P2`).
 * @param [auditRounds] The ticket's `## Audit Rounds` section body, verbatim, or null when absent
 *   (never audited, or every audit passed clean).
 * @returns The compact phase context, or a not-found failure when `phaseId` has no Phases Overview row.
 */
export function formatPhase(
  meta: MetaInfo,
  phases: PhaseOverview[],
  detailsById: Record<string, PhaseDetail | undefined>,
  gates: Gate[],
  handoffs: Record<string, string>,
  phaseId: string,
  auditRounds: string | null = null
): TaskOutcome {
  const idx = phases.findIndex((p) => p.id === phaseId);
  if (idx === -1) return phaseNotFound(phaseId, phases);
  const p = phases[idx] as PhaseOverview;
  const d = detailsById[phaseId];

  const lines: string[] = [
    `[sdd-task] ${meta.taskId ?? '<unknown>'} — ${p.id} ${p.kind}  status=${p.status}`,
  ];

  if (!d) {
    lines.push('(phase section missing — scaffold/repair before dispatch)');
    return { ok: true, text: lines.join('\n') };
  }

  if (d.objective) lines.push(`objective:   ${d.objective}`);

  const pg = gatesForPhase(d, gates);
  lines.push('', 'gates:');
  if (pg.length === 0) lines.push("  — (none required by this phase's rules)");
  for (const g of pg) lines.push(`  ${g.command} — ${gateHint(g.command)}`);

  lines.push('', `exit:        ${d.exit ?? '—'}`);

  const specAnchors = d.specRefs.length
    ? d.specRefs
    : meta.specRefs.map((s) => s.anchor || s.name).filter(Boolean);
  lines.push('', 'read-manifest (AX_READ_PER_MANIFEST):');
  lines.push(`  READ rules:  ${d.rules.length ? d.rules.join(', ') : '—'}`);
  lines.push(`  READ specs:  ${specAnchors.length ? specAnchors.join(', ') : '—'}`);
  lines.push(`  READ ticket: PHASE_${p.id}, BDD, VERIFICATION`);
  lines.push(`  READ files:  ${d.targetFiles.length ? d.targetFiles.join(', ') : '—'}`);
  lines.push(
    '  DO NOT READ: other phase bodies · code outside READ files · specs beyond the anchors above'
  );

  const priorHandoffs = phases
    .slice(0, idx)
    .filter((prev) => prev.status.includes('[x]'))
    .map((prev) => ({ id: prev.id, line: handoffs[prev.id] ?? null }));
  if (priorHandoffs.length > 0) {
    lines.push('', '[HANDOFF]');
    for (const h of priorHandoffs) {
      lines.push(
        `Handoff ←${h.id}: ${h.line ?? '(отсутствует — фаза ещё не закрывалась / Handoff не записан)'}`
      );
    }
  }

  if (auditRounds) {
    lines.push(
      '',
      'Audit Rounds (открытые находки — почини то, что адресовано твоей фазе):',
      auditRounds
    );
  }

  lines.push(
    '',
    'next: прочитай перечисленное, исполняй фазу по протоколу, по завершении sdd-log + Handoff-строка.'
  );
  return { ok: true, text: lines.join('\n') };
}

/**
 * @purpose Build the phase-not-found diagnostic.
 * @param phaseId The requested phase id.
 * @param phases Phases Overview rows (for the "known phases" hint).
 * @returns Outcome with exit 2.
 */
export function phaseNotFound(phaseId: string, phases: PhaseOverview[]): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_PHASE_NOT_FOUND,
    exitCode: 2,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_PHASE_NOT_FOUND}: ${phaseId}`,
      `  known phases: ${phases.map((ph) => ph.id).join(', ') || '(none — Phases Overview is empty)'}`,
    ].join('\n'),
  };
}

/**
 * @purpose Build the bad-invocation diagnostic.
 * @returns Outcome with exit 4.
 */
export function badInvocation(): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_BAD_INVOCATION}`,
      '  expected: gennady sdd-task <ticket-path|Task-ID>',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-error diagnostic — tool-teaches: points a path-shaped argument at the map.
 * @param ticket The ticket path or Task-ID that could not be resolved.
 * @returns Outcome with exit 1.
 */
export function fileError(ticket: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_FILE,
    exitCode: 1,
    message: `[sdd-task] ${ERR_CLI_SDD_TASK_FILE}: ${ticket}\n  ${unreadableTicketHint(ticket)}`,
  };
}

/**
 * @purpose Build the infra-not-ready diagnostic — an impl/refactor/test phase starting while the
 * verification gates are stubs or missing, so any green verdict is vacuous.
 * @param phaseId The requested phase id.
 * @param kind The phase's kind (impl/refactor/test).
 * @param level The readiness level found (`provisional` or `not-ready`).
 * @param detail Stubbed script names (provisional) or the missing list (not-ready).
 * @returns The failure outcome, exit 1.
 */
export function infraNotReadyError(
  phaseId: string,
  kind: string,
  level: string,
  detail: string[]
): TaskOutcome {
  const cause =
    level === 'provisional'
      ? `verification-скрипты — заглушки (${detail.join(', ')}): они выходят с кодом 0, ничего не проверяя`
      : `readiness=not-ready (missing: ${detail.join(', ')})`;
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_INFRA_NOT_READY,
    exitCode: 1,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_INFRA_NOT_READY}: фаза ${phaseId} (kind=${kind}) не может стартовать — ${cause}.`,
      '  Зелёный sdd-verify на такой инфраструктуре не значит ничего: код прошёл бы фазу непроверенным.',
      '  next: выполни infra-очередь (npx gennady sdd-task → GATE_QUEUE), замени заглушки реальными инструментами,',
      '  затем повтори этот вызов. Bootstrap/config/doc-фазы этим гейтом не блокируются.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the unknown-Task-ID diagnostic — the argument has Task-ID shape but scanning the tree
 * found no ticket carrying that Meta Task-ID.
 * @param id The requested Task-ID.
 * @param refs Every ticket's graph ref found while scanning (for the "known Task-IDs" hint).
 * @returns Outcome with exit 2.
 */
export function unknownIdError(id: string, refs: TicketRef[]): TaskOutcome {
  const known = refs.map((r) => r.taskId).filter((t): t is string => t != null);
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_UNKNOWN_ID,
    exitCode: 2,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_UNKNOWN_ID}: ${id}`,
      known.length
        ? `  known Task-IDs: ${known.join(', ')}`
        : '  очередь пуста — тикетов с Task-ID в дереве не найдено.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the ambiguous-Task-ID diagnostic — two or more tickets share one Meta Task-ID.
 * @invariant A collision `sdd-check`'s SDD_TASK_ID_COLLISION should also be catching.
 * @param id The requested Task-ID.
 * @param matches Every ticket ref whose Task-ID equals `id`.
 * @param root Absolute project root (candidate paths are printed relative to it).
 * @returns Outcome with exit 2.
 */
export function ambiguousIdError(id: string, matches: TicketRef[], root: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_AMBIGUOUS_ID,
    exitCode: 2,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_AMBIGUOUS_ID}: ${id} matches ${matches.length} tickets`,
      ...matches.map((m) => `  - ${relative(root, resolve(m.file))}`),
    ].join('\n'),
  };
}

/**
 * @purpose Build the not-a-ticket diagnostic.
 * @param ticket The ticket path.
 * @returns Outcome with exit 2.
 */
export function notATicket(ticket: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_NOT_A_TICKET,
    exitCode: 2,
    message: `[sdd-task] ${ERR_CLI_SDD_TASK_NOT_A_TICKET}: ${ticket}\n  No <!--SECTION:META--> found — this is not a task ticket.`,
  };
}

/**
 * @purpose Build the not-a-v2-ticket-name diagnostic — tool-teaches the naming convention the group boundary relies on.
 * @param ticketPath The resolved ticket path.
 * @param root Absolute project root (path printed relative to it).
 * @returns Outcome with exit 2.
 */
export function notV2TicketNameError(ticketPath: string, root: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_NOT_V2_TICKET_NAME,
    exitCode: 2,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_NOT_V2_TICKET_NAME}: ${groupRelative(root, ticketPath)}`,
      '  expected `<scope-or-module>.task.<Task-ID>.md` — the group boundary is derived from this filename (same dir as `<name>.spec.md`).',
    ].join('\n'),
  };
}

/**
 * @purpose Build the spec-missing diagnostic — the filename resolved to an owning spec path that does not exist on disk.
 * @param ticketPath The resolved ticket path.
 * @param specPath The derived (missing) spec path.
 * @param root Absolute project root (paths printed relative to it).
 * @returns Outcome with exit 1.
 */
export function specMissingError(ticketPath: string, specPath: string, root: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_SPEC_MISSING,
    exitCode: 1,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_SPEC_MISSING}: ${groupRelative(root, ticketPath)}`,
      `  expected owning spec not found on disk: ${groupRelative(root, specPath)} — create it, or move the ticket beside its real spec.`,
    ].join('\n'),
  };
}

/**
 * @purpose Dispatch a failed `AuditGroupResolution` to its matching diagnostic.
 * @param resolution The failed resolution (any `ok: false` variant).
 * @param ticketArg The raw CLI argument, as typed by the operator.
 * @param root Absolute project root.
 * @returns The matching TaskOutcome failure.
 */
export function auditGroupError(
  resolution: Extract<AuditGroupResolution, { ok: false }>,
  ticketArg: string,
  root: string
): TaskOutcome {
  switch (resolution.reason) {
    case 'unreadable':
      return fileError(ticketArg);
    case 'unknown-id':
      return unknownIdError(ticketArg, resolution.refs);
    case 'ambiguous-id':
      return ambiguousIdError(ticketArg, resolution.matches, root);
    case 'not-v2-ticket-name':
      return notV2TicketNameError(resolution.ticketPath, root);
    case 'spec-missing':
      return specMissingError(resolution.ticketPath, resolution.specPath, root);
  }
}

/**
 * @purpose Build the `audit-group: <spec path> (<closed>/<total>)` line the plain ticket plan embeds, so the orchestrator sees group context without a second call.
 * @param specPath The owning spec's path.
 * @param group The group's tickets.
 * @param root Absolute project root.
 * @returns The one-line summary.
 */
export function buildAuditGroupLine(specPath: string, group: TicketRef[], root: string): string {
  const closed = group.filter((r) => /\bDONE\b/i.test(r.status ?? '')).length;
  return `audit-group: ${groupRelative(root, specPath)} (${closed}/${group.length})`;
}

/** @purpose Render the `spec:` line + one `<Task-ID> <status> → <path>` line per group ticket — shared by `--audit-group` and `--group-scope`. | @param specPath The owning spec's path. | @param group The group's tickets. | @param root Absolute project root (paths printed relative to it). | @returns The header lines (no trailing blank line). */
function renderGroupHeader(specPath: string, group: TicketRef[], root: string): string[] {
  const lines = [`spec: ${groupRelative(root, specPath)}`];
  for (const r of group) {
    lines.push(
      `  ${r.taskId ?? '<no-task-id>'} ${r.status ?? '<no-status>'} → ${groupRelative(root, r.file)}`
    );
  }
  return lines;
}

/** @purpose Unmet (non-DONE, non-placeholder) dependency Task-IDs of one ticket, against the project-wide status map. | @param t The ticket to check. | @param allRefs Every ticket ref in the project. | @returns Unmet dependency ids (empty when none). */
function unmetDependencies(t: TicketRef, allRefs: TicketRef[]): string[] {
  const doneIds = new Set(
    allRefs.filter((r) => /\bDONE\b/i.test(r.status ?? '')).map((r) => r.taskId)
  );
  return t.dependencies.filter((d) => !/^(none|n\/a|[—-])\b/i.test(d.trim()) && !doneIds.has(d));
}

/**
 * @purpose Format `sdd-task --audit-group` — the group roster plus the due/not-yet verdict the operator/orchestrator asked for instead of eyeballing it.
 * @invariant The verdict is due only when EVERY group ticket's Status is DONE — partial closure is always `not yet`.
 * @param specPath The owning spec's path.
 * @param group The group's tickets (same directory as `specPath`).
 * @param allRefs Every ticket ref in the project (for the pickable-next-ticket hint).
 * @param root Absolute project root.
 * @returns The formatted group report.
 */
export function formatAuditGroup(
  specPath: string,
  group: TicketRef[],
  allRefs: TicketRef[],
  root: string
): TaskOutcome {
  const lines = renderGroupHeader(specPath, group, root);
  const open = group.filter((r) => !/\bDONE\b/i.test(r.status ?? ''));

  lines.push('');
  if (open.length === 0) {
    lines.push(`audit: due — все тикеты группы закрыты (${group.length}/${group.length})`);
    const anyId = group[0]?.taskId ?? groupRelative(root, specPath);
    lines.push(
      '',
      `next: dispatch ONE audit-subagent (ai/directives/sdd-v2/audit.directive.xml) — mode=per-group, task=${groupRelative(root, specPath)}; get its artifacts via \`sdd-task --group-scope ${anyId}\`.`
    );
    return { ok: true, text: lines.join('\n') };
  }

  lines.push(`audit: not yet — открыто: ${open.map((r) => r.taskId ?? '<no-task-id>').join(', ')}`);

  const groupIds = new Set(group.map((r) => r.taskId));
  const pickableOpen = open.find(
    (r) => r.taskId != null && groupIds.has(r.taskId) && unmetDependencies(r, allRefs).length === 0
  );
  if (pickableOpen) {
    lines.push(
      '',
      `next: возьми ${pickableOpen.taskId} (\`sdd-task ${pickableOpen.taskId}\`), доведи до DONE, затем повтори \`sdd-task --audit-group ${pickableOpen.taskId}\`.`
    );
  } else {
    const first = open[0] as TicketRef;
    const unmet = unmetDependencies(first, allRefs);
    lines.push(
      '',
      unmet.length
        ? `next: ${first.taskId ?? '<no-task-id>'} заблокирован зависимостями (${unmet.join(', ')}) — доведи их до DONE первыми.`
        : `next: возьми ${first.taskId ?? '<no-task-id>'} (\`sdd-task ${first.taskId ?? ''}\`), доведи до DONE, затем повтори \`sdd-task --audit-group ${first.taskId ?? ''}\`.`
    );
  }
  return { ok: true, text: lines.join('\n') };
}

/** @purpose Result of a git-diff scan for `--group-scope` — always honest about whether HEAD exists (AX_GIT_DIFF_SCAN's own caveat). */
export type GroupScopeGit = { available: true; files: string[] } | { available: false };

/**
 * @purpose Format `sdd-task --group-scope` — the ready-made review scope (Target Files ∪ git diff, plus Handoff artifacts) instead of manual git archaeology.
 * @invariant Never fabricates a git range when HEAD is absent — `git:` states that plainly instead of guessing.
 * @param specPath The owning spec's path.
 * @param group The group's tickets.
 * @param root Absolute project root.
 * @param targetFiles Union of every group ticket's phase Target Files.
 * @param handoffArtifacts Union of every group ticket's Handoff `artifacts:` entries.
 * @param git The git-diff scan result (`available: false` when the repo has no HEAD).
 * @param [contractAnchors] Project-relative spec anchors declared by the selected tickets.
 * @param [lintFiles] Source files ready to pass to `gennady lint` without extension guessing.
 * @param [codeRoots] Minimal non-nested roots ready for reverse-inventory checks.
 * @returns The formatted review-scope report.
 */
export function formatGroupScope(
  specPath: string,
  group: TicketRef[],
  root: string,
  targetFiles: string[],
  handoffArtifacts: string[],
  git: GroupScopeGit,
  contractAnchors: string[] = [],
  lintFiles: string[] = [],
  codeRoots: string[] = []
): TaskOutcome {
  const lines = renderGroupHeader(specPath, group, root);

  const files = new Set(targetFiles);
  if (git.available) for (const f of git.files) files.add(f);

  lines.push('', 'files:');
  if (files.size === 0) {
    lines.push(
      '  — нет ни одного Target Files в тикетах группы, ни git-диффа — область обзора построить не из чего; заполни Target Files в тикетах.'
    );
  } else {
    for (const f of files) lines.push(`  ${f}`);
  }

  lines.push(
    '',
    git.available
      ? `git: HEAD vs рабочее дерево (включая untracked, все типы файлов кроме node_modules) — ${git.files.length} файл(ов)`
      : 'git: git-ссылок нет — область обзора построена по Target Files тикетов'
  );

  lines.push('', `contract-anchors: ${contractAnchors.length ? contractAnchors.join(', ') : '—'}`);
  lines.push('', 'lint-files:');
  if (lintFiles.length === 0) lines.push('  —');
  else for (const file of lintFiles) lines.push(`  ${file}`);
  lines.push('', `code-roots: ${codeRoots.length ? codeRoots.join(', ') : '—'}`);

  lines.push('', 'handoff:');
  if (handoffArtifacts.length === 0) {
    lines.push('  — ни в одном тикете группы нет Handoff-строки с артефактами.');
  } else {
    for (const a of handoffArtifacts) lines.push(`  ${a}`);
  }

  lines.push(
    '',
    'next: передай `files` + `handoff` аудит-/код-ревью-сабагенту как готовую область обзора группы — не выясняй git-диапазон вручную.'
  );
  return { ok: true, text: lines.join('\n') };
}
