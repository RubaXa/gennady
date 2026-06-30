// @file: Types, error codes, and planning-surface formatting for the sdd-task command.
// @consumers: SddTaskCommand
// @tasks: N/A

import type { MetaInfo, PhaseOverview, PhaseDetail, Gate } from '../../../shared/sdd/ticket.ts';

/** @purpose No ticket path was passed. */
export const ERR_CLI_SDD_TASK_BAD_INVOCATION = 'ERR_CLI_SDD_TASK_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_TASK_FILE = 'ERR_CLI_SDD_TASK_FILE' as const;
/** @purpose File has no META section — not a ticket. */
export const ERR_CLI_SDD_TASK_NOT_A_TICKET = 'ERR_CLI_SDD_TASK_NOT_A_TICKET' as const;

/**
 * @purpose Result of one sdd-task run.
 * @invariant On success `text` is the planning surface; on failure `message` is never empty.
 */
export type TaskOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

/** @purpose Reduce a rule link/path to its rule-id (basename without .xml), for matching Verification rows. | @param rulePath Rule link target or path. | @returns The basename with any `.xml` stripped. */
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
 * @returns The formatted planning-surface text.
 */
export function formatPlan(
  meta: MetaInfo,
  phases: PhaseOverview[],
  detailsById: Record<string, PhaseDetail | undefined>,
  gates: Gate[]
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
    lines.push(`  ${p.id} ${p.kind}  deps=${p.deps.length ? p.deps.join(',') : '—'}  status=${p.status}`);
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
    lines.push('  DO NOT READ: other phase bodies · code outside READ files · specs beyond the anchors above');
  }

  if (gates.length) {
    lines.push('', 'Gates (all):');
    for (const g of gates) lines.push(`  ${g.command}  ← ${g.requiredBy.join(', ') || '—'}`);
  }

  return lines.join('\n');
}

/** @purpose Build the bad-invocation diagnostic. | @returns Outcome with exit 4. */
export function badInvocation(): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-task] ${ERR_CLI_SDD_TASK_BAD_INVOCATION}`,
      '  expected: gennady sdd-task <ticket-path>',
    ].join('\n'),
  };
}

/** @purpose Build the file-error diagnostic. | @param ticket The ticket path. | @returns Outcome with exit 1. */
export function fileError(ticket: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_FILE,
    exitCode: 1,
    message: `[sdd-task] ${ERR_CLI_SDD_TASK_FILE}: ${ticket}\n  Cannot read the ticket — verify the path.`,
  };
}

/** @purpose Build the not-a-ticket diagnostic. | @param ticket The ticket path. | @returns Outcome with exit 2. */
export function notATicket(ticket: string): TaskOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_TASK_NOT_A_TICKET,
    exitCode: 2,
    message: `[sdd-task] ${ERR_CLI_SDD_TASK_NOT_A_TICKET}: ${ticket}\n  No <!--SECTION:META--> found — this is not a task ticket.`,
  };
}
