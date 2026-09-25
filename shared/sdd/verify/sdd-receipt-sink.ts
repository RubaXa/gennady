// @file: Optional fail-closed SDD phase receipt projection from one terminal VerifyRunReport.
// @spec: CLI-VERIFY
// @consumers: unified Verify command embedding, parity tests

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { VerifyRunReport } from '../../verify/model/verify-report.type.ts';
import type { QualifiedStepId } from '../../verify/model/verify-step.type.ts';
import {
  phaseReceiptPlanState,
  phaseReceiptTargetEvidence,
  phaseReceiptTargetState,
  type PhaseReceipt,
  type PhaseReceiptCommand,
} from '../phase-receipt.ts';
import { markPhaseVerificationProven } from '../phase-verification-plan.ts';
import type { SddVerifyContext } from './sdd-verify-context.ts';

/** @purpose Map one target step to a command identity already frozen in the SDD context. */
export type SddReceiptCommandBinding =
  | {
      readonly stepId: QualifiedStepId;
      readonly source: 'gate';
      readonly gate: string;
    }
  | {
      readonly stepId: QualifiedStepId;
      readonly source: 'verification';
      readonly verificationIndex: number;
    };

type SddReceiptSinkDiagnostic = {
  readonly id:
    | 'SDD_RECEIPT_REPORT_MISMATCH'
    | 'SDD_RECEIPT_REPORT_NOT_PROVEN'
    | 'SDD_RECEIPT_COMMAND_UNPROVEN'
    | 'ERR_CLI_SDD_VERIFY_RECEIPT';
  readonly severity: 'error';
  readonly location: string;
  readonly message: string;
};

/** @purpose Persist a receipt with the exact VerifyRunReport object that authorized it. */
type SddReceiptPersistence = (
  receipt: PhaseReceipt,
  report: VerifyRunReport
) => void | Promise<void>;

/** @purpose Distinguish optional no-op, persisted receipt and typed fail-closed refusal. */
type SddReceiptSinkResult =
  | { readonly ok: true; readonly status: 'not-requested' }
  | { readonly ok: true; readonly status: 'written'; readonly receipt: PhaseReceipt }
  | { readonly ok: false; readonly diagnostic: SddReceiptSinkDiagnostic };

function failure(
  id: SddReceiptSinkDiagnostic['id'],
  context: SddVerifyContext,
  message: string
): SddReceiptSinkResult {
  return {
    ok: false,
    diagnostic: {
      id,
      severity: 'error',
      location: `${context.receiptPlan.ticket}#${context.receiptPlan.phase}`,
      message,
    },
  };
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function bindingKey(binding: SddReceiptCommandBinding): string {
  return binding.source === 'gate'
    ? `gate:${binding.gate}`
    : `verification:${binding.verificationIndex}`;
}

function expectedBindingKeys(context: SddVerifyContext): Set<string> {
  const expected = new Set<string>();
  for (const gate of context.gatePlan?.gates ?? []) {
    if (gate.state === 'CONFIGURED' || gate.state === 'PROVEN') expected.add(`gate:${gate.name}`);
  }
  for (const [index] of context.receiptPlan.verification.entries()) {
    expected.add(`verification:${index}`);
  }
  return expected;
}

function contextIssue(context: SddVerifyContext): string | null {
  const expectedScopeFiles = [
    ...new Set([...context.receiptPlan.targets, ...context.receiptPlan.deletedFiles]),
  ].sort();
  if (
    context.request.task !== context.receiptPlan.ticket ||
    context.request.sddPhase !== context.receiptPlan.phase ||
    context.request.scope.mode !== 'files' ||
    !sameValues(context.request.scope.files, expectedScopeFiles) ||
    !sameValues(context.request.deletedFiles, context.receiptPlan.deletedFiles)
  ) {
    return 'SDD request identity does not match its frozen receipt plan';
  }
  if (
    context.gatePlan !== undefined &&
    (context.gatePlan.phase !== context.receiptPlan.phase ||
      context.gatePlan.profile !== context.receiptPlan.profile ||
      context.gatePlan.producesCoverage !== context.receiptPlan.producesCoverage)
  ) {
    return 'SDD gate plan identity does not match its frozen receipt plan';
  }
  return null;
}

function quoteCommandToken(token: string): string {
  if (/^[A-Za-z0-9_.\-/:=]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

function exactCommandIssue(
  root: string,
  command: NonNullable<VerifyRunReport['plan']['steps'][number]['command']>,
  frozenCommand: string
): string | null {
  let commandRoot: string;
  try {
    commandRoot = realpathSync(command.cwd);
  } catch {
    return 'target step cwd cannot be resolved for receipt command proof';
  }
  if (commandRoot !== root) return 'target step cwd differs from the frozen SDD command root';
  if (command.env !== undefined && Object.keys(command.env).length > 0) {
    return 'target step environment is not represented by the frozen SDD command';
  }
  const rendered = command.argv.map(quoteCommandToken).join(' ');
  return rendered === frozenCommand
    ? null
    : 'target step argv does not exactly match the frozen SDD command';
}

function commandsFromBindings(
  root: string,
  report: VerifyRunReport,
  context: SddVerifyContext,
  bindings: readonly SddReceiptCommandBinding[]
): PhaseReceiptCommand[] | string {
  if (report.plan.steps.length > 0 && context.gatePlan === undefined) {
    return 'target steps cannot prove legacy gate commands without a frozen SDD gate plan';
  }
  const expected = expectedBindingKeys(context);
  const seenSources = new Set<string>();
  const seenSteps = new Set<QualifiedStepId>();
  const commands: PhaseReceiptCommand[] = [];

  for (const binding of bindings) {
    const key = bindingKey(binding);
    if (!expected.has(key) || seenSources.has(key) || seenSteps.has(binding.stepId)) {
      return `receipt binding is unknown or duplicated: ${key} -> ${binding.stepId}`;
    }
    const planned = report.plan.steps.find((step) => step.id === binding.stepId);
    const results = report.results.filter((result) => result.stepId === binding.stepId);
    if (
      planned?.command === undefined ||
      results.length === 0 ||
      results.some((result) => result.status !== 'pass')
    ) {
      return `receipt source ${key} is not proven by a passing runnable step ${binding.stepId}`;
    }

    if (binding.source === 'gate') {
      const gate = context.gatePlan?.gates.find((candidate) => candidate.name === binding.gate);
      if (
        gate?.command === null ||
        gate === undefined ||
        (gate.state !== 'CONFIGURED' && gate.state !== 'PROVEN')
      ) {
        return `legacy gate command is not frozen and configured: ${binding.gate}`;
      }
      const commandIssue = exactCommandIssue(root, planned.command, gate.command);
      if (commandIssue !== null) return `receipt source ${key} is unproven: ${commandIssue}`;
      commands.push({
        gate: gate.name,
        role: planned.effect === 'repair' ? 'repair' : 'foundation',
        command: gate.command,
        exitCode: 0,
      });
    } else {
      const verification = context.receiptPlan.verification[binding.verificationIndex];
      if (verification === undefined) {
        return `legacy verification command is not frozen: ${binding.verificationIndex}`;
      }
      const commandIssue = exactCommandIssue(root, planned.command, verification.command);
      if (commandIssue !== null) return `receipt source ${key} is unproven: ${commandIssue}`;
      commands.push({
        gate: 'verification',
        role: verification.role,
        command: verification.command,
        exitCode: 0,
      });
    }
    seenSources.add(key);
    seenSteps.add(binding.stepId);
  }

  const missing = [...expected].filter((key) => !seenSources.has(key));
  if (missing.length > 0) return `receipt command sources remain unproven: ${missing.join(', ')}`;
  return commands;
}

/**
 * @purpose Project and optionally persist an SDD receipt from the exact terminal report object.
 * @invariant Commands are derived only from the frozen SDD gate/verification context; bindings
 *   carry identities, never caller-authored command strings. UV-13 owns legacy↔target mapping parity.
 * @param root Repository root used for current target evidence.
 * @param report Exact report already consumed by standalone reporters.
 * @param context Immutable SDD adapter product.
 * @param bindings Explicit target-step to frozen receipt-source mapping.
 * @param [persist] Optional workflow sink; omission is an intentional no-write path.
 * @returns Written receipt, optional no-op, or an actionable typed diagnostic.
 */
export async function emitSddReceipt(
  root: string,
  report: VerifyRunReport,
  context: SddVerifyContext,
  bindings: readonly SddReceiptCommandBinding[],
  persist?: SddReceiptPersistence
): Promise<SddReceiptSinkResult> {
  if (persist === undefined) return { ok: true, status: 'not-requested' };
  const request = report.context.request;
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(root);
  } catch (cause) {
    return failure(
      'ERR_CLI_SDD_VERIFY_RECEIPT',
      context,
      `receipt root cannot be resolved: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  const frozenContextIssue = contextIssue(context);
  if (frozenContextIssue !== null) {
    return failure('SDD_RECEIPT_REPORT_MISMATCH', context, frozenContextIssue);
  }
  if (
    resolve(request.root) !== canonicalRoot ||
    request.task !== context.request.task ||
    request.sddPhase !== context.request.sddPhase ||
    request.scope.mode !== context.request.scope.mode ||
    request.scope.changedFrom !== context.request.scope.changedFrom ||
    !sameValues(request.scope.files, context.request.scope.files) ||
    !sameValues(request.deletedFiles ?? [], context.request.deletedFiles)
  ) {
    return failure(
      'SDD_RECEIPT_REPORT_MISMATCH',
      context,
      'VerifyRunReport root, task, SDD phase, or exact Target Files differ from the receipt context'
    );
  }
  if (
    report.verdict !== 'pass' ||
    report.readiness.status === 'BLOCKED' ||
    report.results.some((result) => !['pass', 'skipped', 'waived'].includes(result.status))
  ) {
    return failure(
      'SDD_RECEIPT_REPORT_NOT_PROVEN',
      context,
      'only a terminal passing, non-blocked VerifyRunReport can power an SDD receipt'
    );
  }

  const commands = commandsFromBindings(canonicalRoot, report, context, bindings);
  if (typeof commands === 'string') {
    return failure('SDD_RECEIPT_COMMAND_UNPROVEN', context, commands);
  }
  const targetState = phaseReceiptTargetState(
    canonicalRoot,
    context.receiptPlan.targets,
    context.receiptPlan.deletedFiles
  );
  if (!targetState.ok) return failure('ERR_CLI_SDD_VERIFY_RECEIPT', context, targetState.issue);
  const targetEvidence = phaseReceiptTargetEvidence(
    canonicalRoot,
    context.receiptPlan.targets,
    context.receiptPlan.deletedFiles
  );
  if (!targetEvidence.ok)
    return failure('ERR_CLI_SDD_VERIFY_RECEIPT', context, targetEvidence.issue);

  const provenGateNames = new Set(
    bindings.filter((binding) => binding.source === 'gate').map((binding) => binding.gate)
  );
  const provenPlan = context.gatePlan
    ? markPhaseVerificationProven(context.gatePlan, provenGateNames)
    : undefined;
  const receipt: PhaseReceipt = {
    schema: 1,
    ...context.receiptPlan,
    planState: phaseReceiptPlanState(context.receiptPlan),
    targetState: targetState.state,
    targetEvidence: targetEvidence.evidence,
    commands,
    ...(provenPlan === undefined
      ? {}
      : {
          gateEvidence: provenPlan.gates.map(({ name, state, command, provider }) => ({
            name,
            state,
            command,
            provider,
          })),
        }),
  };
  try {
    await persist(receipt, report);
  } catch (cause) {
    return failure(
      'ERR_CLI_SDD_VERIFY_RECEIPT',
      context,
      `receipt persistence failed: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  return { ok: true, status: 'written', receipt };
}
