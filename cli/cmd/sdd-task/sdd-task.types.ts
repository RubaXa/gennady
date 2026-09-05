// @file: Types, error codes, and planning-surface formatting for the sdd-task command.
// @consumers: SddTaskCommand
// @tasks: N/A

import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type {
  MetaInfo,
  PhaseOverview,
  PhaseDetail,
  Gate,
  TicketCoveragePolicy,
} from '../../../shared/sdd/ticket.ts';
import type { TicketRef } from '../../../shared/sdd/check.ts';
import { unreadableTicketHint } from '../../../shared/sdd/ticket-resolve.ts';
import type { AuditGroupResolution } from '../../../shared/sdd/audit-group.ts';
import {
  formatPhaseVerificationGatePlan,
  type PhaseVerificationPlan,
} from '../../../shared/sdd/phase-verification-plan.ts';

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
/** @purpose Requested phase has an incomplete or stale dependency receipt. */
export const ERR_CLI_SDD_TASK_DEPENDENCY_NOT_READY =
  'ERR_CLI_SDD_TASK_DEPENDENCY_NOT_READY' as const;
/** @purpose Ticket Verification table is malformed, so emitting worker/review context would omit gates. */
export const ERR_CLI_SDD_TASK_VERIFICATION_INVALID =
  'ERR_CLI_SDD_TASK_VERIFICATION_INVALID' as const;
/** @purpose Group review context could not prove its ticket/path/git evidence without omission. */
export const ERR_CLI_SDD_TASK_SCOPE_EVIDENCE = 'ERR_CLI_SDD_TASK_SCOPE_EVIDENCE' as const;
/** @purpose Phase dispatch could not prove its Target/Deleted/Handoff path evidence. */
export const ERR_CLI_SDD_TASK_PHASE_EVIDENCE = 'ERR_CLI_SDD_TASK_PHASE_EVIDENCE' as const;
/** @purpose The complete ticket corpus could not be observed, so map/queue evidence is unavailable. */
export const ERR_CLI_SDD_TASK_TICKET_CORPUS = 'ERR_CLI_SDD_TASK_TICKET_CORPUS' as const;

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
 * @param [auditGroupLine] Precomputed group summary and copy-pasteable audit command, or null when the ticket's filename doesn't resolve to an owning spec.
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
    lines.push(
      `  READ ticket: PHASE_${p.id}, BDD, VERIFICATION${p.kind.trim().toLowerCase() === 'test' ? ', TEST_COVERAGE' : ''}`
    );
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
 * @param [fileLifecycle] Existing Target Files that may be read and absent exact Target Files reserved for creation.
 * @param [verificationPlan] Canonical gate states, providers, and next actions for this phase.
 * @returns The compact phase context, or a not-found failure when `phaseId` has no Phases Overview row.
 */
export function formatPhase(
  meta: MetaInfo,
  phases: PhaseOverview[],
  detailsById: Record<string, PhaseDetail | undefined>,
  gates: Gate[],
  handoffs: Record<string, string>,
  phaseId: string,
  auditRounds: string | null = null,
  fileLifecycle?: { readFiles: string[]; createFiles: string[] },
  verificationPlan?: PhaseVerificationPlan
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
  if (pg.length === 0 && !verificationPlan) lines.push("  — (none required by this phase's rules)");
  for (const g of pg) lines.push(`  ${g.command} — ${gateHint(g.command)}`);
  if (verificationPlan) {
    for (const gate of verificationPlan.gates) {
      lines.push(`  ${formatPhaseVerificationGatePlan(gate)}`);
    }
  }

  lines.push('', `exit:        ${d.exit ?? '—'}`);

  const specAnchors = d.specRefs.length
    ? d.specRefs
    : meta.specRefs.map((s) => s.anchor || s.name).filter(Boolean);
  lines.push('', 'lifecycle manifest (AX_READ_PER_MANIFEST):');
  lines.push(`  READ rules:  ${d.rules.length ? d.rules.join(', ') : '—'}`);
  lines.push(`  READ specs:  ${specAnchors.length ? specAnchors.join(', ') : '—'}`);
  lines.push(
    `  READ ticket: PHASE_${p.id}, BDD, VERIFICATION${p.kind.trim().toLowerCase() === 'test' ? ', TEST_COVERAGE' : ''}`
  );
  const readFiles = fileLifecycle?.readFiles ?? d.targetFiles;
  const createFiles = fileLifecycle?.createFiles ?? [];
  lines.push(`  READ files:  ${readFiles.length ? readFiles.join(', ') : '—'}`);
  lines.push(`  CREATE files: ${createFiles.length ? createFiles.join(', ') : '—'}`);
  lines.push(
    '  DO NOT READ: other phase bodies · code outside READ files · specs beyond the anchors above'
  );
  lines.push(
    '',
    'worker contract (copy verbatim into dispatch):',
    '  READ protocol: ai/directives/sdd-v2/phase-execution-protocol.directive.xml and its four step files',
    '  NEVER READ: node_modules/gennady/** · dist/** · CLI source or bundles',
    '  TOOL FAILURE: preserve the exact diagnostic, form at most one target-local hypothesis, then return a typed blocker; no implementation archaeology',
    '  TICKET: only the exact sdd-verify may append its receipt; never edit status/DONE/Handoff and never call sdd-log'
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
    'next: исполняй переданный worker contract без сокращений, запусти точный sdd-verify и верни typed Handoff оркестратору.'
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
 * @param [detail] Parser or grammar failure; defaults to a generic invalid-arguments detail.
 * @returns Outcome with exit 4.
 */
export function badInvocation(detail = 'invalid arguments'): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_BAD_INVOCATION}`,
      `  problem: ${detail}`,
      '  usage: gennady sdd-task [project-root|ticket-path|Task-ID]',
      '         gennady sdd-task <ticket-path|Task-ID> --phase <PhaseID>',
      '         gennady sdd-task (--audit-group|--group-scope|--task-scope) <ticket-path|Task-ID>',
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
 * @purpose Announce the infra-queue exemption — this ticket builds the missing gates, so its phase
 * proceeds under partial verification.
 * @param level The readiness level (`provisional` or `not-ready`).
 * @param detail Stubbed script names (provisional) or the missing list (not-ready).
 * @returns A single warning line, prepended to the phase context.
 */
export function infraExemptionLine(level: string, detail: string[]): string {
  return [
    `⚠️  [sdd-task] INFRA_QUEUE_EXEMPTION: readiness=${level} (${detail.join(', ')}), но этот тикет сам строит недостающие гейты —`,
    '  фаза исполняется. На STEP_5 используй канонический `npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>`:',
    '  он прочитает это исключение из той же GATE_QUEUE и сам выберет setup; профиль вручную не передавай.',
    '  code/test потребуют те самые ступени, которых ещё нет, и вернут ⛔ — фаза встанет на том, что чинит.',
    '  В `ver`-строку запиши именно выполненную команду и добавь `discovery`-строку про это исключение.',
    '  Верификация здесь ЧАСТИЧНАЯ: перечисленные ступени пока ничего не проверяют. Не считай зелёный',
    '  вердикт доказательством — оно появится, когда эти скрипты станут реальными и по коду пройдёт обычный гейт.',
  ].join('\n');
}

/** @purpose Refuse worker dispatch until every declared dependency has current CLI evidence. | @param phaseId Requested phase id. | @param issue Structural dependency issue. | @returns Actionable failure before any worker starts. */
export function dependencyNotReadyError(phaseId: string, issue: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_DEPENDENCY_NOT_READY,
    exitCode: 1,
    message: `[sdd-task] ${ERR_CLI_SDD_TASK_DEPENDENCY_NOT_READY}: phase ${phaseId} cannot be dispatched — ${issue}.\n  Rerun the stale dependency's canonical sdd-verify command, check it complete, then retry this exact sdd-task --phase call.`,
  };
}

/**
 * @purpose Refuse every task/group context when strict Verification parsing finds a malformed row.
 * @param ticket Ticket path whose context would otherwise be emitted.
 * @param issues Line-numbered structural parser findings.
 * @returns Actionable failure before worker or reviewer dispatch.
 */
export function verificationTableError(ticket: string, issues: readonly string[]): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_VERIFICATION_INVALID,
    exitCode: 1,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_VERIFICATION_INVALID}: ${ticket}`,
      ...issues.map((issue) => `  - ${issue}`),
      '  Serialize each command as a Markdown code span whose backtick delimiter is longer than every backtick run inside the command; runtime bytes are unchanged after parsing.',
    ].join('\n'),
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
    case 'ticket-corpus-unreadable':
      return scopeEvidenceError(
        `${groupRelative(root, resolution.file)}: ${resolution.detail}; no partial ticket group was emitted.`
      );
    case 'path-invalid':
      return scopeEvidenceError(
        `${groupRelative(root, resolution.file)}: ${resolution.detail}; keep every group artifact inside the repository.`
      );
  }
}

/**
 * @purpose Build a fail-closed group-scope evidence error instead of a partial review context.
 * @param detail Exact corpus/path/git evidence failure.
 * @returns Exit-1 teaching outcome without partial scope data.
 */
export function scopeEvidenceError(detail: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_SCOPE_EVIDENCE,
    exitCode: 1,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_SCOPE_EVIDENCE}`,
      `  problem: ${detail}`,
      '  fix the named ticket/path/git evidence, then rerun the same --group-scope or --task-scope command.',
    ].join('\n'),
  };
}

/**
 * @purpose Refuse phase dispatch before any worker context is emitted when path evidence is unsafe.
 * @param detail Exact Target/Deleted/Handoff path failure.
 * @returns Exit-1 teaching outcome without READ/next execution instructions.
 */
export function phaseEvidenceError(detail: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_PHASE_EVIDENCE,
    exitCode: 1,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_PHASE_EVIDENCE}`,
      `  problem: ${detail}`,
      '  fix the named Target Files, Deleted Files, or prior Handoff artifact, then rerun the same sdd-task --phase command.',
    ].join('\n'),
  };
}

/**
 * @purpose Refuse a partial execution map or GATE_QUEUE derived from an unreadable ticket corpus.
 * @param root Selected project root whose corpus is incomplete.
 * @param detail Exact failed corpus observation.
 * @returns Exit-1 teaching outcome without partial map or queue data.
 */
export function ticketCorpusError(root: string, detail: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_TICKET_CORPUS,
    exitCode: 1,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_TICKET_CORPUS}`,
      `  root: ${root}`,
      `  problem: ${detail}`,
      '  fix the named ticket file/directory (or remove the unsafe symlink), then rerun the same command; no partial execution map or GATE_QUEUE was emitted.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the `audit-group: <spec path> (<closed>/<total>)` line the plain ticket plan embeds, so the orchestrator sees group context without a second call.
 * @param specPath The owning spec's path.
 * @param group The group's tickets.
 * @param root Absolute project root.
 * @param selector Copy-pasteable ticket path or Task-ID accepted by `--audit-group`.
 * @returns The group summary plus the exact inspection command on the next line.
 */
export function buildAuditGroupLine(
  specPath: string,
  group: TicketRef[],
  root: string,
  selector: string
): string {
  const closed = group.filter((r) => /\bDONE\b/i.test(r.status ?? '')).length;
  return [
    `audit-group: ${groupRelative(root, specPath)} (${closed}/${group.length})`,
    `audit-command: npx gennady sdd-task --audit-group ${selector}`,
  ].join('\n');
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

/** @purpose Group-attributable changed paths with the exact Git baseline that produced them. */
export type GroupScopeGit = {
  /** @purpose Identifies whether changed paths were derived from HEAD or the unborn-branch index. */
  baseline: 'head' | 'empty-tree';
  /** @purpose Lists the project-relative changed paths attributed under that baseline. */
  files: string[];
};

/** @purpose One ticket's verbatim coverage policy, labelled with its Task-ID for audit. */
export type CoverageGate = TicketCoveragePolicy & {
  /** @purpose The owning ticket's Task-ID. */
  taskId: string;
};

/**
 * @purpose Format `sdd-task --group-scope` — the ready-made review scope (Target Files ∪ group-attributable git diff, plus Handoff artifacts) instead of manual git archaeology.
 * @invariant Never fabricates a git range when HEAD is absent: the typed empty-tree baseline uses
 *   index entries plus untracked paths and `git:` states that scope plainly.
 * @param specPath The owning spec's path.
 * @param group The group's tickets.
 * @param root Absolute project root.
 * @param targetFiles Union of every group ticket's phase Target Files.
 * @param handoffArtifacts Union of every group ticket's Handoff `artifacts:` entries.
 * @param git The git-diff scan result (`available: false` when the repo has no HEAD).
 * @param [contractAnchors] Project-relative spec anchors declared by the selected tickets.
 * @param [lintFiles] Source files ready to pass to `gennady lint` without extension guessing.
 * @param [codeRoots] Minimal non-nested roots ready for reverse-inventory checks.
 * @param [coverageGates] Per-ticket ready-made coverage commands (own threshold + own files).
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
  codeRoots: string[] = [],
  coverageGates: CoverageGate[] = []
): TaskOutcome {
  const lines = renderGroupHeader(specPath, group, root);

  const files = new Set(targetFiles);
  for (const f of git.files) files.add(f);

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
    git.baseline === 'head'
      ? `git: bounded HEAD vs рабочее дерево (exact group files + private target roots; включая untracked/deleted) — ${git.files.length} файл(ов)`
      : `git: bounded empty tree vs индекс + рабочее дерево (exact group files + private target roots; включая staged/intent-to-add/untracked) — ${git.files.length} файл(ов)`
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

  // Per-ticket structured policy — audit executes a required command byte-for-byte or skips the
  // explicit N/A/legacy state. No extension/path/default reconstruction and no blended group gate.
  lines.push('', 'coverage-gates:');
  if (coverageGates.length === 0) {
    lines.push('  — группа не содержит тикетов.');
  } else {
    for (const g of coverageGates) {
      if (g.status === 'required')
        lines.push(`  ${g.taskId}: required (owner ${g.ownerPhase}) — ${g.command}`);
      else if (g.status === 'not-applicable')
        lines.push(`  ${g.taskId}: not-applicable — ${g.reason}`);
      else if (g.status === 'legacy')
        lines.push(
          `  ${g.taskId}: legacy-unset — grandfathered pre-COVERAGE_POLICY:v1; no command inferred`
        );
      else lines.push(`  ${g.taskId}: INVALID — ${g.issues.join('; ')}`);
    }
  }

  lines.push(
    '',
    'next: передай `files` + `handoff` аудит-/код-ревью-сабагенту как готовую область обзора группы — не выясняй git-диапазон вручную; в `coverage-gates` выполняй только `required` command verbatim, N/A/legacy пропускай, INVALID сначала исправь через scaffold/reconcile.'
  );
  return { ok: true, text: lines.join('\n') };
}
