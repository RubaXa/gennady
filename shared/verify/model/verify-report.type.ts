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
  /** @purpose Runner-owned proof that a process attempt, rather than authored argv text, existed. */
  readonly process?: {
    readonly schema: 'gennady.verify-process.v1';
    readonly identity: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly termination: 'completed' | 'timeout' | 'cancelled';
    readonly signal: 'SIGINT' | 'SIGTERM' | null;
  };
  /** @purpose Versioned normalized counts emitted by a declared test runner protocol. */
  readonly testStats?: {
    readonly schema: 'gennady.verify-test-stats.v1';
    readonly policy: 'required' | 'optional' | 'none';
    readonly protocol: string;
    readonly runner: string;
    readonly source: string;
    readonly executed: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
};

/** @purpose Attribute one workspace change to the step that produced it. */
export type VerifyMutation = {
  /** @purpose Repository-relative changed path. */
  readonly path: string;
  /** @purpose Previous repository-relative path when kind is `renamed`. */
  readonly previousPath?: string;
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

/** @purpose Immutable exact-SHA provider proof produced by the read-only U5 watcher. */
export type VerifyRemoteProof = {
  /** @purpose Version the exact-SHA provider evidence projection. */
  readonly schema: 'gennady.verify-remote-proof.v1';
  /** @purpose Provider adapter that produced the observation. */
  readonly provider: 'gitlab' | 'github';
  /** @purpose Provider-relative project identity, never an absolute local path. */
  readonly project: string;
  /** @purpose Provider-neutral workflow/pipeline definition used to disambiguate same-SHA runs. */
  readonly definitionId: string;
  /** @purpose Exact local pushed HEAD requested by Verify. */
  readonly sourceSha: string;
  /** @purpose Immutable provider pipeline/run id pinned before polling. */
  readonly pipelineId: string;
  /** @purpose Exact source SHA returned by the pinned pipeline. */
  readonly pipelineSha: string;
  /** @purpose Raw provider status retained for audit and future adapters. */
  readonly rawStatus: string;
  /** @purpose Typed successful or non-successful provider terminal state. */
  readonly terminalState:
    | 'REMOTE_SUCCESS'
    | 'REMOTE_FAILED'
    | 'REMOTE_CANCELED'
    | 'REMOTE_MANUAL'
    | 'REMOTE_SKIPPED';
  /** @purpose Timestamp recorded when terminal provider evidence was observed. */
  readonly observedAt: string;
  /** @purpose Bounded deterministic job projection with optional failed-log identity. */
  readonly jobs: readonly {
    readonly id: string;
    readonly name: string;
    readonly rawStatus: string;
    readonly logIdentity?: string;
  }[];
};

/** @purpose Snapshot the exact selected phase plan included in the terminal report. */
export type VerifyPlan = {
  /** @purpose Selected phase name. */
  readonly phase: string;
  /** @purpose Composed selector-owned evidence trust and its exact provenance. */
  readonly trust: {
    readonly level: 'local-runner' | 'remote-provider';
    readonly source: string;
  };
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
  /** @purpose Exact pushed-SHA and immutable pipeline identity for remote-trust selectors. */
  readonly remote?: VerifyRemoteProof;
  /** @purpose Same rule snapshot used by planning and any receipt sink. */
  readonly rules: VerifyRuleSnapshot;
  /** @purpose Terminal run verdict. */
  readonly verdict: 'pass' | 'fail' | 'blocked' | 'env-fail' | 'timeout' | 'violation';
};
