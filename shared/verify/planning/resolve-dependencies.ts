// @file: Deterministic dependency closure and topological ordering for verified DAG steps.
// @consumers: verify plan validation and phase selection
// @spec: CLI-VERIFY

import type { PlannedVerifyStep, QualifiedStepId } from '../model/verify-step.type.ts';
import { VerifyPlanError } from './verify-plan.error.ts';

/** @purpose Recover one actionable qualified cycle from the unresolved Kahn remainder. */
function findCycle(
  stepById: ReadonlyMap<QualifiedStepId, PlannedVerifyStep>,
  remaining: ReadonlySet<QualifiedStepId>
): readonly QualifiedStepId[] {
  const state = new Map<QualifiedStepId, 'visiting' | 'visited'>();

  const walk = (
    stepId: QualifiedStepId,
    path: readonly QualifiedStepId[]
  ): readonly QualifiedStepId[] | null => {
    const currentState = state.get(stepId);
    if (currentState === 'visited') return null;
    if (currentState === 'visiting') {
      const cycleStart = path.indexOf(stepId);
      return [...path.slice(cycleStart), stepId];
    }

    const step = stepById.get(stepId);
    if (step === undefined) {
      throw new VerifyPlanError(
        'VERIFY_PLAN_MISSING_DEPENDENCY',
        `step "${stepId}" disappeared from the composed DAG during cycle diagnosis`,
        { stepId }
      );
    }

    state.set(stepId, 'visiting');
    for (const dependencyId of [...step.needs].sort()) {
      if (!remaining.has(dependencyId)) continue;
      const cycle = walk(dependencyId, [...path, stepId]);
      if (cycle !== null) return cycle;
    }
    state.set(stepId, 'visited');
    return null;
  };

  for (const stepId of [...remaining].sort()) {
    const cycle = walk(stepId, []);
    if (cycle !== null) return cycle;
  }
  return [];
}

/**
 * @purpose Return the deterministic dependency closure of selected qualified step ids.
 * @param steps Complete validated DAG available for dependency lookup.
 * @param selectedIds Qualified seed ids selected for the requested phase.
 * @returns Transitive dependency closure in deterministic topological order.
 */
export function resolveDependencies(
  steps: readonly PlannedVerifyStep[],
  selectedIds: readonly QualifiedStepId[]
): PlannedVerifyStep[] {
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const closure = new Set<QualifiedStepId>();

  const collect = (stepId: QualifiedStepId): void => {
    const step = stepById.get(stepId);
    if (step === undefined) {
      throw new VerifyPlanError(
        'VERIFY_PLAN_MISSING_DEPENDENCY',
        `step "${stepId}" is selected or required but is not present in the composed DAG`,
        { stepId }
      );
    }
    if (closure.has(stepId)) return;
    closure.add(stepId);
    for (const dependencyId of step.needs) collect(dependencyId);
  };

  for (const selectedId of [...selectedIds].sort()) collect(selectedId);

  const indegree = new Map<QualifiedStepId, number>();
  const dependents = new Map<QualifiedStepId, QualifiedStepId[]>();
  for (const stepId of closure) {
    const step = stepById.get(stepId);
    if (step === undefined) {
      throw new VerifyPlanError(
        'VERIFY_PLAN_MISSING_DEPENDENCY',
        `step "${stepId}" disappeared from the composed DAG during ordering`,
        { stepId }
      );
    }
    indegree.set(stepId, step.needs.length);
    for (const dependencyId of step.needs) {
      const dependencyDependents = dependents.get(dependencyId) ?? [];
      dependencyDependents.push(stepId);
      dependents.set(dependencyId, dependencyDependents);
    }
  }

  const ready = [...closure].filter((stepId) => indegree.get(stepId) === 0).sort();
  const ordered: PlannedVerifyStep[] = [];
  while (ready.length > 0) {
    const stepId = ready.shift();
    if (stepId === undefined) break;
    const step = stepById.get(stepId);
    if (step === undefined) {
      throw new VerifyPlanError(
        'VERIFY_PLAN_MISSING_DEPENDENCY',
        `step "${stepId}" disappeared from the composed DAG during ordering`,
        { stepId }
      );
    }
    ordered.push(step);

    for (const dependentId of [...(dependents.get(stepId) ?? [])].sort()) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(dependentId);
        ready.sort();
      }
    }
  }

  if (ordered.length !== closure.size) {
    const orderedIds = new Set(ordered.map((step) => step.id));
    const remaining = new Set([...closure].filter((stepId) => !orderedIds.has(stepId)));
    const cycle = findCycle(stepById, remaining);
    throw new VerifyPlanError(
      'VERIFY_PLAN_CYCLE',
      `dependency cycle detected: ${cycle.join(' -> ') || [...remaining].sort().join(', ')}`,
      { cycle: cycle.length > 0 ? cycle : [...remaining].sort() }
    );
  }

  return ordered;
}
