// @file: Current-plan and command validation for CLI-owned phase receipts.
// @consumers: sdd-check, sdd-task, phase-run
// @tasks: N/A

import { relative, resolve } from 'node:path';
import {
  parsePhaseReceipts,
  phaseReceiptPlanState,
  phaseReceiptTargetEvidence,
  phaseReceiptTargetState,
  phaseVerificationEnvironmentState,
  phaseVerificationPlanEnvironmentState,
  type PhaseReceipt,
  type PhaseReceiptPlan,
} from '../../../shared/sdd/phase-receipt.ts';
import type { PhaseVerificationPlan } from '../../../shared/sdd/phase-verification-plan.ts';
import { phaseVerificationNodeReaches } from '../../../shared/sdd/phase-verification-plan.ts';
import { collectTicketCorpus } from '../../../shared/sdd/ticket-resolve.ts';
import { resolvePhaseContext } from './phase-context.ts';

/** @purpose Reconstruct the exact current mechanical plan for one persisted receipt. | @param root Project root. | @param receipt Persisted receipt. | @param phase Phase id. | @param taskPath Absolute ticket path. | @returns Current plan or a structural issue. */
export function expectedPhaseReceiptPlan(
  root: string,
  receipt: PhaseReceipt,
  phase: string,
  taskPath: string
):
  | { ok: true; plan: PhaseReceiptPlan; gatePlan: PhaseVerificationPlan }
  | { ok: false; issue: string } {
  const context = resolvePhaseContext(relative(root, taskPath), phase, root);
  if (!context.ok) return { ok: false, issue: context.message.split('\n')[0] ?? context.message };
  const profileBasis = receipt.profileBasis;
  if (profileBasis === 'infra-queue-exemption' && receipt.profile !== 'setup')
    return { ok: false, issue: 'infra-queue-exemption receipt must use setup profile' };
  if (profileBasis === 'phase-kind' && context.context.profileBasis !== 'phase-kind')
    return {
      ok: false,
      issue: 'current phase is infra-queue exempt but receipt claims phase-kind',
    };
  const profile =
    profileBasis === 'infra-queue-exemption' ? ('setup' as const) : context.context.profile;
  const gatePlan = context.context.gatePlan;
  if (!gatePlan) return { ok: false, issue: 'current phase has no canonical gate plan' };
  const environment = receipt.gateEvidence
    ? phaseVerificationPlanEnvironmentState(root, gatePlan, context.context.verification)
    : phaseVerificationEnvironmentState(
        root,
        profile,
        context.context.producesCoverage,
        context.context.verification,
        context.context.targets.length > 0
      );
  if (!environment.ok) return { ok: false, issue: environment.issue };
  return {
    ok: true,
    gatePlan,
    plan: {
      ticket: context.context.taskPath,
      phase: context.context.phaseId,
      profile,
      profileBasis,
      targets: [...context.context.targets],
      deletedFiles: [...context.context.deletedFiles],
      verification: context.context.verification.map((gate) => ({ ...gate })),
      ...(context.context.coverageOwner ? { coverageOwner: context.context.coverageOwner } : {}),
      producesCoverage: context.context.producesCoverage,
      environmentState: environment.state,
    },
  };
}

/** @purpose Validate that persisted successful commands exactly attest the receipt plan. | @param receipt Persisted phase receipt. | @param [gatePlan] Canonical applicable gates used to validate modern receipts. | @returns Completeness issue or null. */
export function phaseReceiptCommandIssue(
  receipt: PhaseReceipt,
  gatePlan?: PhaseVerificationPlan
): string | null {
  const ladder = receipt.commands.filter((command) => command.gate !== 'verification');
  const extras = receipt.commands.filter((command) => command.gate === 'verification');
  const required = gatePlan
    ? gatePlan.gates
        .filter((gate) => gate.state === 'CONFIGURED' && gate.command !== null)
        .map((gate) => gate.name)
    : receipt.profile === 'code'
      ? [...(receipt.targets.length > 0 ? ['fix'] : []), 'type-check', 'test']
      : receipt.profile === 'test'
        ? [
            ...(receipt.targets.length > 0 ? ['fix'] : []),
            'type-check',
            receipt.producesCoverage ? 'test:coverage' : 'test',
          ]
        : [];
  const ladderNames = ladder.map((command) => command.gate);
  if (new Set(ladderNames).size !== ladderNames.length) return 'receipt repeats a ladder command';
  if (gatePlan) {
    if (JSON.stringify(ladderNames) !== JSON.stringify(required))
      return `receipt foundation differs from canonical applicable plan: expected ${required.join(' → ') || 'none'}, got ${ladderNames.join(' → ') || 'none'}`;
    if (receipt.gateEvidence) {
      const expectedEvidence = gatePlan.gates.map(({ name, state, command, provider }) => ({
        name,
        state: state === 'CONFIGURED' ? 'PROVEN' : state,
        command,
        provider,
      }));
      if (JSON.stringify(receipt.gateEvidence) !== JSON.stringify(expectedEvidence))
        return 'receipt gate evidence differs from the canonical applicable plan';
    }
  } else if (receipt.profile === 'setup') {
    const order = ['fix', 'type-check', 'test'];
    if (ladderNames.some((name) => !order.includes(name)))
      return 'setup receipt contains an impossible ladder command';
    if (
      ladderNames.some(
        (name, index) =>
          index > 0 && order.indexOf(name) < order.indexOf(ladderNames[index - 1] as string)
      )
    )
      return 'setup receipt ladder is out of order';
  } else if (JSON.stringify(ladderNames) !== JSON.stringify(required)) {
    return `receipt foundation is incomplete: expected ${required.join(' → ')}, got ${ladderNames.join(' → ') || 'none'}`;
  }
  if (ladder.some((command) => command.role !== (command.gate === 'fix' ? 'repair' : 'foundation')))
    return 'receipt ladder roles do not match repair/foundation ownership';
  if (extras.length !== receipt.verification.length)
    return 'receipt omits or repeats a §Verification command';
  for (let index = 0; index < extras.length; index++) {
    const actual = extras[index];
    const expected = receipt.verification[index];
    if (
      !actual ||
      !expected ||
      actual.command !== expected.command ||
      actual.role !== expected.role
    )
      return 'receipt §Verification commands differ from the structured plan';
  }
  return null;
}

function supersededTargets(
  root: string,
  receipt: PhaseReceipt,
  phase: string,
  taskPath: string,
  current: Readonly<Record<string, string>>,
  pendingWriter?: {
    taskPath: string;
    phase: string;
    targets: readonly string[];
  }
): Set<string> {
  if (!receipt.targetEvidence) return new Set();
  const corpus = collectTicketCorpus(root);
  if (!corpus.ok) return new Set();
  const changed = Object.keys(receipt.targetEvidence).filter(
    (path) => current[path] !== receipt.targetEvidence?.[path]
  );
  const superseded = new Set<string>();
  if (
    pendingWriter &&
    phaseVerificationNodeReaches(
      corpus.refs,
      { ticketFile: pendingWriter.taskPath, phaseId: pendingWriter.phase },
      { ticketFile: taskPath, phaseId: phase }
    )
  ) {
    const owned = new Set(pendingWriter.targets);
    for (const path of changed) if (owned.has(path)) superseded.add(path);
  }
  for (const ref of corpus.refs) {
    const parsed = parsePhaseReceipts(ref.content);
    if (!parsed.ok) continue;
    for (const candidate of parsed.receipts) {
      const candidatePath = resolve(root, candidate.ticket);
      if (resolve(candidatePath) === resolve(taskPath) && candidate.phase === phase) continue;
      if (
        !phaseVerificationNodeReaches(
          corpus.refs,
          { ticketFile: candidatePath, phaseId: candidate.phase },
          { ticketFile: taskPath, phaseId: phase }
        )
      )
        continue;
      if (!candidate.targetEvidence) continue;
      const candidateExpected = expectedPhaseReceiptPlan(
        root,
        candidate,
        candidate.phase,
        candidatePath
      );
      if (!candidateExpected.ok) continue;
      if (candidate.planState !== phaseReceiptPlanState(candidateExpected.plan)) continue;
      if (
        phaseReceiptCommandIssue(
          candidate,
          candidate.gateEvidence ? candidateExpected.gatePlan : undefined
        )
      )
        continue;
      for (const path of changed) {
        if (candidate.targets.includes(path) && candidate.targetEvidence[path] === current[path])
          superseded.add(path);
      }
    }
  }
  return superseded;
}

/** @purpose Validate one receipt against current plan, command evidence, target bytes and tombstones. | @param root Project root. | @param receipt Persisted receipt. | @param phase Phase id. | @param taskPath Absolute ticket path. | @param [pendingWriter] Current ordered downstream writer allowed to supersede shared targets. | @returns Currentness issue or null. */
export function phaseReceiptIssue(
  root: string,
  receipt: PhaseReceipt,
  phase: string,
  taskPath: string,
  pendingWriter?: {
    taskPath: string;
    phase: string;
    targets: readonly string[];
  }
): string | null {
  const evidence = phaseReceiptTargetEvidence(root, receipt.targets, receipt.deletedFiles);
  if (!evidence.ok) return 'Target Files or Deleted Files changed after verification';
  const legacyState = receipt.targetEvidence
    ? null
    : phaseReceiptTargetState(root, receipt.targets, receipt.deletedFiles);
  if (legacyState && (!legacyState.ok || legacyState.state !== receipt.targetState))
    return 'Target Files or Deleted Files changed after verification';
  const expected = expectedPhaseReceiptPlan(root, receipt, phase, taskPath);
  if (!expected.ok) return expected.issue;
  if (receipt.planState !== phaseReceiptPlanState(expected.plan))
    return 'verification plan or environment changed after its receipt';
  const commands = phaseReceiptCommandIssue(
    receipt,
    receipt.gateEvidence ? expected.gatePlan : undefined
  );
  if (commands) return commands;
  if (receipt.targetEvidence) {
    const changed = Object.keys(receipt.targetEvidence).filter(
      (path) => evidence.evidence[path] !== receipt.targetEvidence?.[path]
    );
    if (changed.length > 0) {
      const superseded = supersededTargets(
        root,
        receipt,
        phase,
        taskPath,
        evidence.evidence,
        pendingWriter
      );
      if (changed.some((path) => !superseded.has(path)))
        return 'Target Files or Deleted Files changed after verification';
    }
  }
  return null;
}
