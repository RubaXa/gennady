// @file: Declarative unit of work in a verify preset DAG.
// @consumers: verify presets, planner, executors, reporters
// @spec: CLI-VERIFY

import type { PluginId } from './plugin-id.type.ts';

/** @purpose Describe a local process invocation without shell interpretation. */
export type LocalCommand = {
  /** @purpose Command and arguments passed directly to the process runtime. */
  readonly argv: readonly string[];
  /** @purpose Absolute working directory for the process. */
  readonly cwd: string;
  /** @purpose Environment values merged over the invoking process environment. */
  readonly env?: Readonly<Record<string, string>>;
  /** @purpose Maximum process lifetime in milliseconds. */
  readonly timeoutMs: number;
};

/** @purpose Declare one capability a verify step needs before execution. */
export type Requirement = {
  /** @purpose Stable requirement identifier within its plugin. */
  readonly id: string;
  /** @purpose Capability class used by readiness probes and reporters. */
  readonly kind: 'command' | 'script' | 'file' | 'config' | 'credential' | 'runtime';
  /** @purpose Human-readable capability expectation. */
  readonly description: string;
  /** @purpose Whether absence blocks the selected phase instead of degrading it. */
  readonly required: boolean;
  /** @purpose Actionable installation or configuration instruction. */
  readonly fix: string;
  /** @purpose Optional non-mutating command used to probe the capability. */
  readonly probe?: LocalCommand;
};

/** @purpose Bound files a repair or drift-producing step may change. */
export type WriteBoundary = {
  /** @purpose Absolute root against which include and exclude globs are evaluated. */
  readonly root: string;
  /** @purpose File globs the step is permitted to write. */
  readonly include: readonly string[];
  /** @purpose More-specific exclusions from the permitted write set. */
  readonly exclude?: readonly string[];
};

/** @purpose Describe one immutable node in a plugin-owned verify DAG. */
export type VerifyStep = {
  /** @purpose Identifier unique within the owning plugin. */
  readonly id: string;
  /** @purpose Plugin that owns the step. */
  readonly plugin: PluginId;
  /** @purpose Phase-selection labels attached to the step. */
  readonly tags: readonly string[];
  /** @purpose Qualified or same-plugin step identifiers that must complete first. */
  readonly needs: readonly string[];
  /** @purpose Execution boundary selected for the step. */
  readonly executor: 'local' | 'vcs-pipeline' | 'remote-job';
  /** @purpose Observable effect category used by workspace and retry policy. */
  readonly effect: 'observe' | 'repair' | 'drift-signal' | 'remote-watch';
  /** @purpose Local command; absent for executors whose adapter supplies the operation. */
  readonly command?: LocalCommand;
  /** @purpose Capabilities that must be evaluated for the selected step. */
  readonly requires: readonly Requirement[];
  /** @purpose Allowed mutation surface for effects that may write. */
  readonly writes?: WriteBoundary;
  /** @purpose Step ids whose successful observations become stale after this step writes. */
  readonly invalidates?: readonly string[];
  /** @purpose End-to-end step timeout, including remote polling when applicable. */
  readonly timeoutMs: number;
  /** @purpose Planner policy after this step reaches a failing terminal state. */
  readonly onFailure: 'stop-phase' | 'block-dependents' | 'continue';
};

/** @purpose Identify one normalized step across all composed plugins. */
export type QualifiedStepId = `${string}:${string}`;

/** @purpose Represent a validated planner node with normalized cross-plugin references. */
export type PlannedVerifyStep = Omit<VerifyStep, 'id' | 'needs' | 'invalidates'> & {
  /** @purpose Canonical `<plugin>:<local-id>` identity. */
  readonly id: QualifiedStepId;
  /** @purpose Canonical qualified dependency identities. */
  readonly needs: readonly QualifiedStepId[];
  /** @purpose Canonical qualified invalidation identities. */
  readonly invalidates?: readonly QualifiedStepId[];
};
