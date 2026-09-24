// @file: Bounded local verify runner with selective post-repair invalidation.
// @spec: CLI-VERIFY
// @consumers: target reporters and SDD adapter after UV-11/12

import type {
  VerifyEvidence,
  VerifyMutation,
  VerifyPlan,
  VerifyRunReport,
  VerifyStepResult,
} from '../model/verify-report.type.ts';
import type { CapabilityMatrix } from '../model/verify-readiness.type.ts';
import type { PlannedVerifyStep, QualifiedStepId } from '../model/verify-step.type.ts';
import { executeLocalStep, type LocalStepExecution } from './local.executor.ts';
import { acquireWorkspaceGuard } from './workspace-guard.ts';

const MAX_REPAIR_PASSES = 3;
const DEFAULT_EVIDENCE_BYTES = 64 * 1024;

type RepairProblem = {
  readonly code: string;
  readonly message: string;
  readonly stepId?: QualifiedStepId;
};

/** @purpose Return deterministic local plan attempts, mutations, evidence, and aggregate terminal state. */
export type LocalVerifyExecution = {
  /** @purpose Accepted run verdict plus cooperative cancellation before report projection. */
  readonly verdict: VerifyRunReport['verdict'] | 'cancelled';
  /** @purpose Terminal step events in execution order, including rechecks and blocked dependents. */
  readonly results: readonly VerifyStepResult[];
  /** @purpose Every attributed mutation in execution then stable per-step path order. */
  readonly mutations: readonly VerifyMutation[];
  /** @purpose Bounded evidence in the same deterministic attempt order. */
  readonly evidence: readonly VerifyEvidence[];
  /** @purpose Dominant actionable non-pass diagnostic, when present. */
  readonly problem?: RepairProblem;
  /** @purpose POSIX cancellation identity after WorkspaceGuard restoration. */
  readonly cancellation?: {
    readonly signal: 'SIGINT' | 'SIGTERM';
    readonly exitCode: 130 | 143;
  };
};

type MutableExecution = {
  verdict: LocalVerifyExecution['verdict'];
  results: VerifyStepResult[];
  mutations: VerifyMutation[];
  evidence: VerifyEvidence[];
  problem?: RepairProblem;
  cancellation?: LocalVerifyExecution['cancellation'];
};

type AttemptRecord = {
  readonly execution: LocalStepExecution;
  readonly resultIndex: number | null;
};

function boundedText(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const marker = '\n[truncated]';
  const budget = Math.max(0, maxBytes - Buffer.byteLength(marker));
  let prefix = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character);
    if (bytes + size > budget) break;
    prefix += character;
    bytes += size;
  }
  return `${prefix}${marker}`;
}

function severity(verdict: LocalVerifyExecution['verdict']): number {
  switch (verdict) {
    case 'violation':
      return 6;
    case 'cancelled':
      return 5;
    case 'blocked':
      return 4;
    case 'timeout':
      return 3;
    case 'env-fail':
      return 2;
    case 'fail':
      return 1;
    default:
      return 0;
  }
}

function aggregateVerdict(
  current: LocalVerifyExecution['verdict'],
  next: LocalStepExecution['verdict']
): LocalVerifyExecution['verdict'] {
  if (next === 'waived' || next === 'skipped') return current;
  return severity(next) > severity(current) ? next : current;
}

function validatePlan(plan: VerifyPlan): RepairProblem | null {
  if (plan.steps.length === 0) {
    return { code: 'VERIFY_REPAIR_PLAN_EMPTY', message: 'selected local verify plan is empty' };
  }
  const index = new Map<QualifiedStepId, number>();
  for (const [position, step] of plan.steps.entries()) {
    if (index.has(step.id)) {
      return {
        code: 'VERIFY_REPAIR_PLAN_INVALID',
        message: `selected plan contains duplicate step ${step.id}`,
        stepId: step.id,
      };
    }
    index.set(step.id, position);
  }
  for (const [position, step] of plan.steps.entries()) {
    for (const dependency of step.needs) {
      const dependencyPosition = index.get(dependency);
      if (dependencyPosition === undefined || dependencyPosition >= position) {
        return {
          code: 'VERIFY_REPAIR_PLAN_INVALID',
          message: `step ${step.id} does not follow dependency ${dependency} in the selected plan`,
          stepId: step.id,
        };
      }
    }
  }
  return null;
}

function dependentIndex(
  plan: VerifyPlan
): ReadonlyMap<QualifiedStepId, readonly QualifiedStepId[]> {
  const values = new Map<QualifiedStepId, QualifiedStepId[]>();
  for (const step of plan.steps) {
    for (const dependency of step.needs) {
      const dependents = values.get(dependency) ?? [];
      dependents.push(step.id);
      values.set(dependency, dependents);
    }
  }
  for (const dependents of values.values()) dependents.sort();
  return values;
}

function transitiveDependents(
  seeds: readonly QualifiedStepId[],
  dependents: ReadonlyMap<QualifiedStepId, readonly QualifiedStepId[]>
): ReadonlySet<QualifiedStepId> {
  const closure = new Set<QualifiedStepId>();
  const pending = [...seeds].sort();
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || closure.has(current)) continue;
    closure.add(current);
    for (const dependent of dependents.get(current) ?? []) pending.push(dependent);
    pending.sort();
  }
  return closure;
}

function selectiveRechecks(
  plan: VerifyPlan,
  repair: PlannedVerifyStep,
  latest: ReadonlyMap<QualifiedStepId, VerifyStepResult>,
  dependents: ReadonlyMap<QualifiedStepId, readonly QualifiedStepId[]>
): readonly PlannedVerifyStep[] {
  const stale = transitiveDependents(repair.invalidates ?? [], dependents);
  return plan.steps.filter((step) => {
    if (!stale.has(step.id)) return false;
    if (step.effect !== 'observe' && step.effect !== 'drift-signal') return false;
    return latest.get(step.id)?.status === 'pass';
  });
}

function immutableResult(state: MutableExecution): LocalVerifyExecution {
  return {
    verdict: state.verdict,
    results: state.results,
    mutations: state.mutations,
    evidence: state.evidence,
    ...(state.problem === undefined ? {} : { problem: state.problem }),
    ...(state.cancellation === undefined ? {} : { cancellation: state.cancellation }),
  };
}

/**
 * @purpose Execute one validated local phase with bounded repair convergence and selective rechecks.
 * @param root Repository root owned by the WorkspaceGuard transaction.
 * @param plan Dependency-ordered selected local phase.
 * @param readiness Selected-slice readiness consumed by each exact step.
 * @param [options] Bounded passes, evidence, cancellation, and signal ownership.
 * @returns Deterministic terminal local execution product for UV-11 report projection.
 */
export async function runLocalVerifyPlan(
  root: string,
  plan: VerifyPlan,
  readiness: CapabilityMatrix,
  options: {
    readonly maxEvidenceBytes?: number;
    readonly maxPolicyOutputBytes?: number;
    readonly signal?: AbortSignal;
    readonly cancellationSignal?: 'SIGINT' | 'SIGTERM';
    readonly signalHandlers?: boolean;
  } = {}
): Promise<LocalVerifyExecution> {
  const maxEvidenceBytes = options.maxEvidenceBytes ?? DEFAULT_EVIDENCE_BYTES;
  const initial: MutableExecution = {
    verdict: 'pass',
    results: [],
    mutations: [],
    evidence: [],
  };
  if (
    !Number.isInteger(maxEvidenceBytes) ||
    maxEvidenceBytes < 128 ||
    maxEvidenceBytes > DEFAULT_EVIDENCE_BYTES
  ) {
    initial.verdict = 'blocked';
    initial.problem = {
      code: 'VERIFY_REPAIR_OPTIONS_INVALID',
      message: `maxEvidenceBytes must be an integer between 128 and ${DEFAULT_EVIDENCE_BYTES}`,
    };
    return immutableResult(initial);
  }
  const planProblem = validatePlan(plan);
  if (planProblem !== null) {
    initial.verdict = 'blocked';
    initial.problem = planProblem;
    return immutableResult(initial);
  }

  const acquired = acquireWorkspaceGuard(root, {
    signalHandlers: options.signalHandlers,
  });
  if (acquired.kind === 'error') {
    initial.verdict =
      acquired.error.code === 'VERIFY_WORKSPACE_LOCKED' ||
      acquired.error.code === 'VERIFY_WORKSPACE_NOT_GIT'
        ? 'blocked'
        : 'violation';
    initial.problem = { code: acquired.error.code, message: acquired.error.message };
    return immutableResult(initial);
  }

  const guard = acquired.guard;
  const state = initial;
  const latest = new Map<QualifiedStepId, VerifyStepResult>();
  const dependents = dependentIndex(plan);
  const blocked = new Set<QualifiedStepId>();
  let attempt = 0;
  let stopped = false;

  const record = async (step: PlannedVerifyStep): Promise<AttemptRecord> => {
    attempt += 1;
    const execution = await executeLocalStep(step, guard, {
      readiness,
      signal: options.signal,
      cancellationSignal: options.cancellationSignal,
      maxEvidenceBytes,
      ...(options.maxPolicyOutputBytes === undefined
        ? {}
        : { maxPolicyOutputBytes: options.maxPolicyOutputBytes }),
    });
    const resultIndex = execution.result === null ? null : state.results.length;
    if (execution.result !== null) {
      state.results.push(execution.result);
      latest.set(step.id, execution.result);
    }
    state.mutations.push(...execution.mutations);
    state.evidence.push(
      ...execution.evidence.map((entry) => ({
        ...entry,
        identity: `${entry.identity}:attempt-${attempt}`,
      }))
    );
    if (execution.problem !== undefined && execution.evidence.length === 0) {
      state.evidence.push({
        kind: 'log',
        identity: `local:${step.id}:problem:attempt-${attempt}`,
        summary: boundedText(execution.problem.message, maxEvidenceBytes),
      });
    }
    const previousVerdict = state.verdict;
    state.verdict = aggregateVerdict(previousVerdict, execution.verdict);
    if (
      execution.problem !== undefined &&
      execution.verdict !== 'waived' &&
      execution.verdict !== 'skipped' &&
      severity(execution.verdict) >= severity(previousVerdict)
    ) {
      state.problem = {
        code: execution.problem.code,
        message: execution.problem.message,
        stepId: step.id,
      };
    }
    if (execution.cancellation !== undefined) state.cancellation = execution.cancellation;
    return { execution, resultIndex };
  };

  const shouldStop = (step: PlannedVerifyStep, execution: LocalStepExecution): boolean => {
    if (
      execution.verdict === 'pass' ||
      execution.verdict === 'waived' ||
      execution.verdict === 'skipped'
    ) {
      return false;
    }
    if (
      execution.verdict === 'violation' ||
      execution.verdict === 'cancelled' ||
      execution.verdict === 'blocked'
    ) {
      return true;
    }
    if (step.onFailure === 'continue') return false;
    if (step.onFailure === 'block-dependents') {
      const closure = transitiveDependents([step.id], dependents);
      for (const dependent of closure) {
        if (dependent !== step.id) blocked.add(dependent);
      }
      return false;
    }
    return true;
  };

  for (const step of plan.steps) {
    if (stopped) break;
    if (blocked.has(step.id)) {
      const message = `step ${step.id} was not executed because a failed dependency blocked its path`;
      state.results.push({
        stepId: step.id,
        plugin: step.plugin,
        status: 'skipped',
        exitCode: null,
        durationMs: 0,
        output: boundedText(message, maxEvidenceBytes),
      });
      state.evidence.push({
        kind: 'log',
        identity: `local:${step.id}:blocked-dependent`,
        summary: boundedText(message, maxEvidenceBytes),
      });
      continue;
    }

    let current = await record(step);
    if (shouldStop(step, current.execution)) {
      stopped = true;
      break;
    }
    if (step.effect !== 'repair' || current.execution.verdict !== 'pass') continue;

    for (let repairPass = 1; ; repairPass += 1) {
      if (current.execution.mutations.length === 0) break;
      const rechecks = selectiveRechecks(plan, step, latest, dependents);
      for (const recheck of rechecks) {
        const rechecked = await record(recheck);
        if (shouldStop(recheck, rechecked.execution)) {
          stopped = true;
          break;
        }
      }
      if (stopped) break;
      if (repairPass >= MAX_REPAIR_PASSES) {
        const message = `repair step ${step.id} still mutated the workspace after ${MAX_REPAIR_PASSES} passes`;
        if (current.resultIndex !== null) {
          const previous = state.results[current.resultIndex]!;
          const violation: VerifyStepResult = {
            ...previous,
            status: 'violation',
            output: boundedText(message, maxEvidenceBytes),
          };
          state.results[current.resultIndex] = violation;
          latest.set(step.id, violation);
        }
        state.verdict = 'violation';
        state.problem = {
          code: 'VERIFY_REPAIR_NON_CONVERGENT',
          message,
          stepId: step.id,
        };
        state.evidence.push({
          kind: 'log',
          identity: `local:${step.id}:non-convergent`,
          summary: boundedText(message, maxEvidenceBytes),
        });
        stopped = true;
        break;
      }
      current = await record(step);
      if (shouldStop(step, current.execution)) {
        stopped = true;
        break;
      }
    }
  }

  const released = guard.release();
  if (released.kind === 'error') {
    state.verdict = 'violation';
    state.problem = { code: released.error.code, message: released.error.message };
    state.evidence.push({
      kind: 'log',
      identity: 'local:workspace:release-error',
      summary: boundedText(released.error.message, maxEvidenceBytes),
    });
  }
  return immutableResult(state);
}
