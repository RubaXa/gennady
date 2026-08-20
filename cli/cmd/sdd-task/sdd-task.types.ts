// @file: Types, error codes, and planning-surface formatting for the sdd-task command.
// @consumers: SddTaskCommand
// @tasks: N/A

import { relative, resolve } from 'node:path';
import type { MetaInfo, PhaseOverview, PhaseDetail, Gate } from '../../../shared/sdd/ticket.ts';
import type { TicketRef } from '../../../shared/sdd/check.ts';

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
 * @returns The formatted planning-surface text.
 */
export function formatPlan(
  meta: MetaInfo,
  phases: PhaseOverview[],
  detailsById: Record<string, PhaseDetail | undefined>,
  gates: Gate[],
  activeBlockers: string[] = []
): string {
  const lines: string[] = [];
  lines.push(`[sdd-task] ${meta.taskId ?? '<unknown>'} — ${meta.status ?? '<no status>'}`);
  if (meta.purpose) lines.push(`Purpose: ${meta.purpose}`);
  lines.push(`Scope/Module: ${meta.scope ?? '—'} / ${meta.module ?? '—'}`);
  lines.push(`Dependencies: ${meta.dependencies.length ? meta.dependencies.join(', ') : 'none'}`);
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
 * @invariant The Handoff block appears only when an earlier, `[x]`-checked phase has a captured Handoff line — never for the first phase.
 * @param meta Parsed Meta planning fields.
 * @param phases Phases Overview rows.
 * @param detailsById Parsed phase bodies keyed by phase id.
 * @param gates All Verification gates.
 * @param handoffs Phase id → its verbatim `**Handoff →**` line (`parsePhaseHandoffs`).
 * @param phaseId The requested phase id (e.g. `P2`).
 * @returns The compact phase context, or a not-found failure when `phaseId` has no Phases Overview row.
 */
export function formatPhase(
  meta: MetaInfo,
  phases: PhaseOverview[],
  detailsById: Record<string, PhaseDetail | undefined>,
  gates: Gate[],
  handoffs: Record<string, string>,
  phaseId: string
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
    .map((prev) => ({ id: prev.id, line: handoffs[prev.id] }))
    .filter((h): h is { id: string; line: string } => typeof h.line === 'string');
  if (priorHandoffs.length > 0) {
    lines.push('', '[HANDOFF]');
    for (const h of priorHandoffs) lines.push(`Handoff ←${h.id}: ${h.line}`);
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
  const looksPathy = /[\\/]/.test(ticket) || /\.md$/i.test(ticket);
  const hint = looksPathy
    ? 'Cannot read the ticket at that path — verify it, or run `sdd-task` with no arguments for the execution map (it lists every Task-ID with its path).'
    : 'Cannot read the ticket — verify the path or Task-ID, or run `sdd-task` with no arguments for the execution map.';
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_FILE,
    exitCode: 1,
    message: `[sdd-task] ${ERR_CLI_SDD_TASK_FILE}: ${ticket}\n  ${hint}`,
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
