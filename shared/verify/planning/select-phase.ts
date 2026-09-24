// @file: Phase-tag seed selection over a validated verify DAG.
// @consumers: verify planner and future preset adapters
// @spec: CLI-VERIFY

import type { VerifyPreset } from '../model/verify-preset.type.ts';
import type { PluginId } from '../model/plugin-id.type.ts';
import type { VerifyPlan } from '../model/verify-report.type.ts';
import type { QualifiedStepId } from '../model/verify-step.type.ts';
import { resolveDependencies } from './resolve-dependencies.ts';
import { validatePlan } from './validate-plan.ts';
import { VerifyPlanError } from './verify-plan.error.ts';

/**
 * @purpose Select phase-tagged seeds plus their transitive dependencies in deterministic order.
 * @param presets Authored plugin presets to validate and slice.
 * @param phase Exact phase name every composed preset must declare.
 * @param [seedPlugins] Optional scope-affected plugins allowed to contribute phase seeds; the full
 *   composed DAG remains available to dependency closure.
 * @returns Qualified phase plan containing seeds and their dependency closure.
 */
export function selectPhase(
  presets: readonly VerifyPreset[],
  phase: string,
  seedPlugins?: readonly PluginId[]
): VerifyPlan {
  const plan = validatePlan(presets);
  const selectedIds: QualifiedStepId[] = [];
  const allowedPlugins = seedPlugins === undefined ? null : new Set(seedPlugins);

  for (const preset of plan.presets) {
    const selector = preset.phases[phase];
    if (selector === undefined) {
      throw new VerifyPlanError(
        'VERIFY_PLAN_UNKNOWN_PHASE',
        `plugin "${preset.plugin}" does not declare phase "${phase}"; known phases: ${
          Object.keys(preset.phases).sort().join(', ') || 'none'
        }`,
        { plugin: preset.plugin, phase, knownPhases: Object.keys(preset.phases).sort() }
      );
    }

    if (allowedPlugins !== null && !allowedPlugins.has(preset.plugin)) continue;

    const excluded = new Set(selector.exclude ?? []);
    for (const step of preset.steps) {
      const included = step.tags.some((tag) => selector.include.includes(tag));
      const excludedSeed = step.tags.some((tag) => excluded.has(tag));
      if (included && !excludedSeed) selectedIds.push(step.id);
    }
  }

  return { phase, steps: resolveDependencies(plan.steps, selectedIds) };
}
