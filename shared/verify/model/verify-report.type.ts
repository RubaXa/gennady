// @file: Typed terminal report emitted by the unified verify engine.
// @consumers: text/json reporters, SDD receipt sink
// @spec: CLI-VERIFY

import type { PluginId } from './plugin-id.type.ts';
import type { VerificationContext, VerifyRuleSnapshot } from './verify-context.type.ts';
import type { CapabilityMatrix } from './verify-readiness.type.ts';
import type { PlannedVerifyStep, QualifiedStepId } from './verify-step.type.ts';

/** @purpose Classify every terminal step outcome across local and remote executors. */
export type VerifyStepStatus =
  | 'pass'
  | 'fail'
  | 'env-fail'
  | 'timeout'
  | 'violation'
  | 'skipped'
  | 'waived'
  | 'cancelled';

/** @purpose Record the terminal result of one selected verify step. */
export type VerifyStepResult = {
  /** @purpose Qualified step id used by dependency and report consumers. */
  readonly stepId: QualifiedStepId;
  /** @purpose Plugin that owns the step. */
  readonly plugin: PluginId;
  /** @purpose Terminal status; pending and running never count as success. */
  readonly status: VerifyStepStatus;
  /** @purpose Process exit code when the executor exposes one. */
  readonly exitCode: number | null;
  /** @purpose Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** @purpose Bounded diagnostic output retained for non-passing outcomes. */
  readonly output: string;
};

/** @purpose Attribute one workspace change to the step that produced it. */
export type VerifyMutation = {
  /** @purpose Repository-relative changed path. */
  readonly path: string;
  /** @purpose Qualified id of the mutating step. */
  readonly stepId: QualifiedStepId;
  /** @purpose Observed filesystem change kind. */
  readonly kind: 'created' | 'modified' | 'deleted' | 'renamed';
  /** @purpose Whether the change fell within the step's declared write boundary. */
  readonly allowed: boolean;
};

/** @purpose Reference durable or bounded evidence without embedding provider implementation. */
export type VerifyEvidence = {
  /** @purpose Stable evidence category. */
  readonly kind: 'command' | 'diff' | 'log' | 'remote-pipeline' | 'receipt';
  /** @purpose Immutable or run-local evidence identity. */
  readonly identity: string;
  /** @purpose Human-readable bounded summary. */
  readonly summary: string;
};

/** @purpose Snapshot the exact selected phase plan included in the terminal report. */
export type VerifyPlan = {
  /** @purpose Selected phase name. */
  readonly phase: string;
  /** @purpose Dependency-ordered selected steps. */
  readonly steps: readonly PlannedVerifyStep[];
};

/** @purpose Return one honest terminal result for standalone and SDD verification consumers. */
export type VerifyRunReport = {
  /** @purpose Immutable facts used to plan the run. */
  readonly context: VerificationContext;
  /** @purpose Capability outcome for the selected DAG slice. */
  readonly readiness: CapabilityMatrix;
  /** @purpose Exact selected plan after composition and slicing. */
  readonly plan: VerifyPlan;
  /** @purpose Terminal step results in plan order. */
  readonly results: readonly VerifyStepResult[];
  /** @purpose Workspace mutations attributed to their producing steps. */
  readonly mutations: readonly VerifyMutation[];
  /** @purpose Durable or bounded proof collected by executors. */
  readonly evidence: readonly VerifyEvidence[];
  /** @purpose Same rule snapshot used by planning and any receipt sink. */
  readonly rules: VerifyRuleSnapshot;
  /** @purpose Terminal run verdict. */
  readonly verdict: 'pass' | 'fail' | 'blocked' | 'env-fail' | 'timeout' | 'violation';
};
