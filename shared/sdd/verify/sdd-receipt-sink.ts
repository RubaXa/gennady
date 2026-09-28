// @file: Optional fail-closed SDD phase receipt projection from one terminal VerifyRunReport.
// @spec: CLI-VERIFY
// @consumers: unified Verify command embedding, parity tests

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { VerifyRunReport } from '../../verify/model/verify-report.type.ts';
import type { VerifyPlan } from '../../verify/model/verify-report.type.ts';
import type { CapabilityMatrix } from '../../verify/model/verify-readiness.type.ts';
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
      readonly projection?: undefined;
    }
  | {
      readonly stepIds: readonly QualifiedStepId[];
      readonly source: 'gate';
      readonly gate: 'fix';
      readonly projection: 'target-repair';
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
): { readonly ok: false; readonly diagnostic: SddReceiptSinkDiagnostic } {
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

function bindingStepIds(binding: SddReceiptCommandBinding): readonly QualifiedStepId[] {
  return 'stepIds' in binding ? binding.stepIds : [binding.stepId];
}

function expectedBindingKeys(context: SddVerifyContext): Set<string> {
  const expected = new Set<string>();
  for (const gate of context.gatePlan?.gates ?? []) {
    if (
      gate.state === 'CONFIGURED' &&
      !(gate.name === 'fix' && context.receiptPlan.targets.length === 0)
    ) {
      expected.add(`gate:${gate.name}`);
    }
  }
  for (const [index] of context.receiptPlan.verification.entries()) {
    expected.add(`verification:${index}`);
  }
  return expected;
}

/**
 * @purpose Resolve exact frozen legacy receipt sources to unique runnable target steps pre-spawn.
 * @param root Canonical project root used to prove command cwd containment.
 * @param plan Validated universal Verify plan whose runnable steps may prove legacy commands.
 * @param context Frozen SDD receipt context containing the explicit overlay command sources.
 * @param readiness Selected-slice readiness adapted with the same PROVEN step identities.
 * @returns Either a complete one-to-one binding or a typed fail-closed diagnostic.
 */
export function bindSddReceiptCommands(
  root: string,
  plan: VerifyPlan,
  context: SddVerifyContext,
  readiness: CapabilityMatrix
):
  | {
      readonly ok: true;
      readonly bindings: readonly SddReceiptCommandBinding[];
      readonly plan: VerifyPlan;
      readonly readiness: CapabilityMatrix;
    }
  | { readonly ok: false; readonly diagnostic: SddReceiptSinkDiagnostic } {
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(root);
  } catch (cause) {
    return failure(
      'SDD_RECEIPT_COMMAND_UNPROVEN',
      context,
      `receipt root cannot be resolved: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
  const candidates = plan.steps;
  const used = new Set<QualifiedStepId>();
  const provenSteps = new Set<QualifiedStepId>();
  const bindings: SddReceiptCommandBinding[] = [];
  const sources: readonly (
    | { readonly source: 'gate'; readonly gate: string; readonly command: string }
    | {
        readonly source: 'verification';
        readonly verificationIndex: number;
        readonly command: string;
      }
  )[] = [
    ...(context.gatePlan?.gates.flatMap((gate) => {
      if (
        gate.command === null ||
        gate.state !== 'CONFIGURED' ||
        (gate.name === 'fix' && context.receiptPlan.targets.length === 0)
      ) {
        return [];
      }
      return [{ source: 'gate' as const, gate: gate.name, command: gate.command }];
    }) ?? []),
    ...context.receiptPlan.verification.map((entry, verificationIndex) => ({
      source: 'verification' as const,
      verificationIndex,
      command: entry.command,
    })),
  ];
  for (const gate of context.gatePlan?.gates ?? []) {
    if (
      gate.state !== 'PROVEN' ||
      gate.command === null ||
      (gate.name === 'fix' && context.receiptPlan.targets.length === 0)
    ) {
      continue;
    }
    const matching = candidates.filter(
      (step) =>
        !used.has(step.id) &&
        (step.command === undefined
          ? step.id.slice(step.id.indexOf(':') + 1) === gate.name
          : exactCommandIssue(canonicalRoot, step.command, gate.command!) === null)
    );
    if (matching.length !== 1) {
      return failure(
        'SDD_RECEIPT_COMMAND_UNPROVEN',
        context,
        `proven gate:${gate.name} must map to exactly one target step before compatibility execution; found ${matching.length}`
      );
    }
    used.add(matching[0]!.id);
    provenSteps.add(matching[0]!.id);
  }
  for (const source of sources) {
    if (source.source === 'gate' && source.command === 'target-repair') {
      const primaryRepairs = candidates.filter(
        (step) =>
          step.plugin === context.primaryPlugin && step.effect === 'repair' && !used.has(step.id)
      );
      if (
        primaryRepairs.length === 0 ||
        primaryRepairs.some((step) => step.command === undefined)
      ) {
        return failure(
          'SDD_RECEIPT_COMMAND_UNPROVEN',
          context,
          'gate:fix target-repair requires every canonical primary-provider repair step to be runnable'
        );
      }
      for (const step of primaryRepairs) used.add(step.id);
      bindings.push({
        stepIds: primaryRepairs.map((step) => step.id),
        source: 'gate',
        gate: 'fix',
        projection: 'target-repair',
      });
      continue;
    }
    const matching = candidates.filter(
      (step) =>
        step.command !== undefined &&
        !used.has(step.id) &&
        exactCommandIssue(canonicalRoot, step.command, source.command) === null
    );
    if (matching.length !== 1) {
      const key =
        source.source === 'gate'
          ? `gate:${source.gate}`
          : `verification:${source.verificationIndex}`;
      return failure(
        'SDD_RECEIPT_COMMAND_UNPROVEN',
        context,
        `${key} must map to exactly one runnable target step before execution; found ${matching.length}`
      );
    }
    const [step] = matching;
    used.add(step!.id);
    bindings.push(
      source.source === 'gate'
        ? { stepId: step!.id, source: 'gate', gate: source.gate }
        : {
            stepId: step!.id,
            source: 'verification',
            verificationIndex: source.verificationIndex,
          }
    );
  }
  const inheritedNeeds = (
    stepId: QualifiedStepId,
    visiting = new Set<QualifiedStepId>()
  ): QualifiedStepId[] => {
    if (visiting.has(stepId)) return [];
    const step = plan.steps.find((candidate) => candidate.id === stepId);
    if (step === undefined) return [];
    if (!provenSteps.has(stepId)) return [stepId];
    const next = new Set(visiting);
    next.add(stepId);
    return step.needs.flatMap((need) => inheritedNeeds(need, next));
  };
  const adaptedSteps = plan.steps
    .filter((step) => !provenSteps.has(step.id))
    .map((step) => ({
      ...step,
      needs: [...new Set(step.needs.flatMap((need) => inheritedNeeds(need)))].sort(),
      invalidates: step.invalidates?.filter((id) => !provenSteps.has(id)),
    }));
  const adaptedEntries = readiness.entries.filter(
    (entry) => entry.stepId === undefined || !provenSteps.has(entry.stepId)
  );
  const adaptedReadiness: CapabilityMatrix = {
    status: adaptedEntries.some((entry) => entry.status === 'BLOCKED' && entry.blocking !== false)
      ? 'BLOCKED'
      : adaptedEntries.some((entry) => entry.status !== 'READY')
        ? 'DEGRADED'
        : 'READY',
    entries: adaptedEntries,
  };
  return {
    ok: true,
    bindings,
    plan: { ...plan, steps: adaptedSteps },
    readiness: adaptedReadiness,
  };
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
    const stepIds = bindingStepIds(binding);
    if (
      !expected.has(key) ||
      seenSources.has(key) ||
      stepIds.length === 0 ||
      stepIds.some((stepId) => seenSteps.has(stepId))
    ) {
      return `receipt binding is unknown or duplicated: ${key} -> ${stepIds.join(',')}`;
    }
    const planned = stepIds.map((stepId) => report.plan.steps.find((step) => step.id === stepId));
    const results = stepIds.flatMap((stepId) =>
      report.results.filter((result) => result.stepId === stepId)
    );
    if (
      planned.some((step) => step?.command === undefined) ||
      stepIds.some((stepId) => !results.some((result) => result.stepId === stepId)) ||
      results.some((result) => result.status !== 'pass')
    ) {
      return `receipt source ${key} is not proven by passing runnable steps ${stepIds.join(',')}`;
    }

    if (binding.source === 'gate') {
      const gate = context.gatePlan?.gates.find((candidate) => candidate.name === binding.gate);
      if (gate?.command === null || gate === undefined || gate.state !== 'CONFIGURED') {
        return `legacy gate command is not frozen and configured: ${binding.gate}`;
      }
      if (binding.projection === 'target-repair') {
        if (
          gate.name !== 'fix' ||
          gate.command !== 'target-repair' ||
          planned.some((step) => step?.effect !== 'repair')
        ) {
          return 'target-repair projection is not backed by canonical primary-provider repairs';
        }
      } else {
        const commandIssue = exactCommandIssue(root, planned[0]!.command!, gate.command);
        if (commandIssue !== null) return `receipt source ${key} is unproven: ${commandIssue}`;
      }
      commands.push({
        gate: gate.name,
        role: planned.some((step) => step?.effect === 'repair') ? 'repair' : 'foundation',
        command: gate.command,
        exitCode: 0,
      });
    } else {
      const verification = context.receiptPlan.verification[binding.verificationIndex];
      if (verification === undefined) {
        return `legacy verification command is not frozen: ${binding.verificationIndex}`;
      }
      const commandIssue = exactCommandIssue(root, planned[0]!.command!, verification.command);
      if (commandIssue !== null) return `receipt source ${key} is unproven: ${commandIssue}`;
      commands.push({
        gate: 'verification',
        role: verification.role,
        command: verification.command,
        exitCode: 0,
      });
    }
    seenSources.add(key);
    for (const stepId of stepIds) seenSteps.add(stepId);
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
