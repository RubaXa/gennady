// @file: The host API a stack plugin may use — the whole surface, re-exported in one place.
// @spec: SHARED
// @consumers: plugins/**, package.json#exports["./stack"]

export type {
  Cmd,
  EnvFailPredicate,
  Gate,
  GateOutcome,
  GatePlanOptions,
  GateSpec,
  ScopeRequest,
  StackDetection,
  StackDiagnostic,
  StackPlugin,
  StackScope,
  StackVerifyCapability,
} from './verify.types.ts';

export type { PluginId } from './model/plugin-id.type.ts';
export type {
  LocalCommand,
  Requirement,
  VerifyStep,
  WriteBoundary,
} from './model/verify-step.type.ts';
export type {
  PhaseSelector,
  VerifyPreset,
  VerifyStepOverride,
} from './model/verify-preset.type.ts';
export type {
  VerificationContext,
  VerifyRequest,
  VerifyRuleSelection,
  VerifyRuleSnapshot,
  VerifyScope,
} from './model/verify-context.type.ts';
export type {
  CapabilityMatrix,
  VerifyReadiness,
  VerifyReadinessStatus,
} from './model/verify-readiness.type.ts';
export type {
  VerifyEvidence,
  VerifyMutation,
  VerifyPlan,
  VerifyRunReport,
  VerifyStepResult,
  VerifyStepStatus,
} from './model/verify-report.type.ts';

export { allOf, exitCodeMatches, outputMatches, streamMatches } from './env-fail.ts';
export { parseDuration } from '../../services/config/config-loader.ts';
export { execFileTrimSafe } from '../../shared/common/exec.ts';
