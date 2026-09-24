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
  StackTargetVerifyCapability,
  StackVerifyCapability,
} from './verify.types.ts';

export type { PluginId } from './model/plugin-id.type.ts';
export type {
  LocalCommand,
  PlannedVerifyStep,
  QualifiedStepId,
  Requirement,
  VerifyEnvironmentFailureRule,
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
  MultistackVerifyPlan,
  VerifyStackParticipation,
} from './model/verify-multistack.type.ts';
export type {
  VerifyEvidence,
  VerifyMutation,
  VerifyPlan,
  VerifyRunReport,
  VerifyStepResult,
  VerifyStepStatus,
} from './model/verify-report.type.ts';

export { adaptLegacyStackConfig } from './config/adapt-legacy-stack-config.ts';
export { loadVerifyConfig } from './config/load-verify-config.ts';
export { VerifyConfigError } from './config/verify-config.error.ts';
export type { VerifyConfigErrorCode } from './config/verify-config.error.ts';
export type {
  ComposedVerifyPresets,
  ComposeVerifyPresetsInput,
  DetectedVerifyConfigLayer,
  LegacyVerifyConfigAdapter,
  VerifyPluginPolicy,
  VerifyCommandConfig,
  VerifyConfig,
  VerifyConfigLoad,
  VerifyMigrationDiagnostic,
  VerifyPluginConfig,
  VerifyStepConfig,
  VerifyStepWaiver,
} from './config/verify-config.type.ts';

export { composePresets } from './planning/compose-presets.ts';
export { selectPhase } from './planning/select-phase.ts';
export { resolveDependencies } from './planning/resolve-dependencies.ts';
export { validatePlan } from './planning/validate-plan.ts';
export type { ValidatedVerifyPlan, ValidatedVerifyPreset } from './planning/validate-plan.ts';
export { VerifyPlanError } from './planning/verify-plan.error.ts';
export type { VerifyPlanErrorCode, VerifyPlanErrorDetails } from './planning/verify-plan.error.ts';

export { allOf, exitCodeMatches, outputMatches, streamMatches } from './env-fail.ts';
export { parseDuration } from '../../services/config/config-loader.ts';
export { execFileTrimSafe } from '../../shared/common/exec.ts';
