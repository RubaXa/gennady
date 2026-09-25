// @file: Immutable SDD phase adapter for the unified Verify report and legacy receipt plan.
// @spec: CLI-VERIFY
// @consumers: sdd-verify compatibility runner, SDD receipt sink

import type { VerifyScope } from '../../verify/model/verify-context.type.ts';
import type { StackId } from '../../verify/verify.types.ts';
import {
  phaseVerificationEnvironmentState,
  phaseVerificationPlanEnvironmentState,
  type PhaseReceiptPlan,
} from '../phase-receipt.ts';
import type { PhaseVerificationPlan } from '../phase-verification-plan.ts';

type SddPhaseVerifyInput = {
  readonly profile: 'setup' | 'code' | 'test';
  readonly profileBasis: 'phase-kind' | 'infra-queue-exemption';
  readonly targets: readonly string[];
  readonly deletedFiles: readonly string[];
  readonly taskPath: string;
  readonly phaseId: string;
  readonly verification: readonly { readonly command: string; readonly role: string }[];
  readonly coverageOwner?: string;
  readonly producesCoverage: boolean;
  readonly gatePlan?: PhaseVerificationPlan;
  readonly stack?: StackId;
};

/** @purpose Bind one target Verify request to the exact frozen legacy-compatible SDD receipt plan. */
export type SddVerifyContext = {
  /** @purpose Exact task, SDD phase, existing targets and tombstones carried into the report. */
  readonly request: {
    readonly task: string;
    readonly sddPhase: string;
    readonly scope: VerifyScope;
    readonly deletedFiles: readonly string[];
  };
  /** @purpose Legacy receipt inputs frozen before unified execution starts. */
  readonly receiptPlan: PhaseReceiptPlan;
  /** @purpose Canonical legacy gate identities used only for explicit UV-13 parity mapping. */
  readonly gatePlan?: PhaseVerificationPlan;
};

type SddVerifyContextDiagnostic = {
  readonly id: 'ERR_CLI_SDD_VERIFY_RECEIPT';
  readonly severity: 'error';
  readonly location: string;
  readonly message: string;
};

/** @purpose Return an immutable SDD adapter product or one legacy-compatible receipt diagnostic. */
type SddVerifyContextResult =
  | { readonly ok: true; readonly context: SddVerifyContext }
  | { readonly ok: false; readonly diagnostic: SddVerifyContextDiagnostic };

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function failure(phase: SddPhaseVerifyInput, message: string): SddVerifyContextResult {
  return {
    ok: false,
    diagnostic: {
      id: 'ERR_CLI_SDD_VERIFY_RECEIPT',
      severity: 'error',
      location: `${phase.taskPath}#${phase.phaseId}`,
      message,
    },
  };
}

function exactPhaseScopeFiles(phase: SddPhaseVerifyInput): readonly string[] {
  return [...new Set([...phase.targets, ...phase.deletedFiles])].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
}

/**
 * @purpose Derive unified SDD request identity and the byte-compatible legacy receipt plan once.
 * @param root Canonical repository root used by legacy environment fingerprinting.
 * @param phase Exact structurally parsed SDD phase data.
 * @returns Deep-frozen context, or the same fail-closed environment issue as the legacy planner.
 */
export function adaptSddVerifyContext(
  root: string,
  phase: SddPhaseVerifyInput
): SddVerifyContextResult {
  const stack = phase.stack ?? 'node';
  const environment = phase.gatePlan
    ? phaseVerificationPlanEnvironmentState(root, phase.gatePlan, phase.verification, stack)
    : phaseVerificationEnvironmentState(
        root,
        phase.profile,
        phase.producesCoverage,
        phase.verification,
        phase.targets.length > 0,
        stack
      );
  if (!environment.ok) return failure(phase, environment.issue);

  const receiptPlan: PhaseReceiptPlan = {
    ticket: phase.taskPath,
    phase: phase.phaseId,
    profile: phase.profile,
    profileBasis: phase.profileBasis,
    targets: [...phase.targets],
    deletedFiles: [...phase.deletedFiles],
    verification: phase.verification.map((entry) => ({ ...entry })),
    ...(phase.coverageOwner === undefined ? {} : { coverageOwner: phase.coverageOwner }),
    producesCoverage: phase.gatePlan?.producesCoverage ?? phase.producesCoverage,
    environmentState: environment.state,
  };
  return {
    ok: true,
    context: freezeDeep({
      request: {
        task: phase.taskPath,
        sddPhase: phase.phaseId,
        scope: { mode: 'files', files: exactPhaseScopeFiles(phase) },
        deletedFiles: [...phase.deletedFiles],
      },
      receiptPlan,
      ...(phase.gatePlan === undefined
        ? {}
        : {
            gatePlan: {
              ...phase.gatePlan,
              gates: phase.gatePlan.gates.map((gate) => ({
                ...gate,
                prerequisites: [...gate.prerequisites],
              })),
            },
          }),
    }),
  };
}
