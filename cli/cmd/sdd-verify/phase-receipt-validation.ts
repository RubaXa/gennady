// @file: Current-plan and command validation for CLI-owned phase receipts.
// @consumers: sdd-check, sdd-task, phase-run
// @tasks: N/A

import { relative } from 'node:path';
import {
  phaseReceiptPlanState,
  phaseReceiptTargetState,
  phaseVerificationEnvironmentState,
  type PhaseReceipt,
  type PhaseReceiptPlan,
} from '../../../shared/sdd/phase-receipt.ts';
import { resolvePhaseContext } from './phase-context.ts';

/** @purpose Reconstruct the exact current mechanical plan for one persisted receipt. | @param root Project root. | @param receipt Persisted receipt. | @param phase Phase id. | @param taskPath Absolute ticket path. | @returns Current plan or a structural issue. */
export function expectedPhaseReceiptPlan(
  root: string,
  receipt: PhaseReceipt,
  phase: string,
  taskPath: string
): { ok: true; plan: PhaseReceiptPlan } | { ok: false; issue: string } {
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
  const environment = phaseVerificationEnvironmentState(
    root,
    profile,
    context.context.producesCoverage,
    context.context.verification,
    context.context.targets.length > 0
  );
  if (!environment.ok) return { ok: false, issue: environment.issue };
  return {
    ok: true,
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

/** @purpose Validate that persisted successful commands exactly attest the receipt plan. | @param receipt Persisted phase receipt. | @returns Completeness issue or null. */
export function phaseReceiptCommandIssue(receipt: PhaseReceipt): string | null {
  const ladder = receipt.commands.filter((command) => command.gate !== 'verification');
  const extras = receipt.commands.filter((command) => command.gate === 'verification');
  const repair = receipt.targets.length > 0 ? ['fix'] : [];
  const required =
    receipt.profile === 'code'
      ? [...repair, 'type-check', 'test']
      : receipt.profile === 'test'
        ? [...repair, 'type-check', receipt.producesCoverage ? 'test:coverage' : 'test']
        : [];
  const ladderNames = ladder.map((command) => command.gate);
  if (new Set(ladderNames).size !== ladderNames.length) return 'receipt repeats a ladder command';
  if (receipt.profile === 'setup') {
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

/** @purpose Validate one receipt against current plan, command evidence, target bytes and tombstones. | @param root Project root. | @param receipt Persisted receipt. | @param phase Phase id. | @param taskPath Absolute ticket path. | @returns Currentness issue or null. */
export function phaseReceiptIssue(
  root: string,
  receipt: PhaseReceipt,
  phase: string,
  taskPath: string
): string | null {
  const expected = expectedPhaseReceiptPlan(root, receipt, phase, taskPath);
  if (!expected.ok) return expected.issue;
  if (receipt.planState !== phaseReceiptPlanState(expected.plan))
    return 'verification plan or environment changed after its receipt';
  const commands = phaseReceiptCommandIssue(receipt);
  if (commands) return commands;
  const state = phaseReceiptTargetState(root, receipt.targets, receipt.deletedFiles);
  if (!state.ok || state.state !== receipt.targetState)
    return 'Target Files or Deleted Files changed after verification';
  return null;
}
