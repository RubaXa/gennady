// @file: Fail-closed normalization and validation of composed verify presets.
// @consumers: phase selection, preset/config composition tests
// @spec: CLI-VERIFY

import type { PluginId } from '../model/plugin-id.type.ts';
import type { PhaseSelector, VerifyPreset } from '../model/verify-preset.type.ts';
import type { PlannedVerifyStep, QualifiedStepId, VerifyStep } from '../model/verify-step.type.ts';
import { resolveDependencies } from './resolve-dependencies.ts';
import { VerifyPlanError } from './verify-plan.error.ts';

/** @purpose Preserve one validated preset's selectors and normalized steps. */
export type ValidatedVerifyPreset = {
  /** @purpose Plugin whose authored local ids were qualified. */
  readonly plugin: PluginId;
  /** @purpose Plugin-owned steps after id and reference normalization. */
  readonly steps: readonly PlannedVerifyStep[];
  /** @purpose Validated phase selectors retained for later slicing. */
  readonly phases: Readonly<Record<string, PhaseSelector>>;
};

/** @purpose Carry the complete normalized DAG after all structural checks pass. */
export type ValidatedVerifyPlan = {
  /** @purpose Validated presets with their plugin-local selectors. */
  readonly presets: readonly ValidatedVerifyPreset[];
  /** @purpose Complete normalized DAG in deterministic qualified-id order. */
  readonly steps: readonly PlannedVerifyStep[];
};

/** @purpose Reject empty, whitespace-bearing, or delimiter-bearing identifier segments. */
function validateIdSegment(value: string, subject: string): void {
  if (value.length > 0 && value.trim() === value && !/\s|:/.test(value)) return;
  throw new VerifyPlanError(
    'VERIFY_PLAN_INVALID_ID',
    `${subject} "${value}" must be a non-empty, whitespace-free local id without ':'`,
    { subject, value }
  );
}

/** @purpose Produce the canonical cross-preset identity for one local step. */
function qualifyStepId(plugin: PluginId, localId: string): QualifiedStepId {
  return `${plugin}:${localId}`;
}

/** @purpose Normalize a same-plugin local reference or preserve an explicit qualified reference. */
function normalizeReference(
  ownerPlugin: PluginId,
  reference: string,
  subject: string
): QualifiedStepId {
  const separator = reference.indexOf(':');
  if (separator === -1) {
    validateIdSegment(reference, subject);
    return qualifyStepId(ownerPlugin, reference);
  }

  if (separator !== reference.lastIndexOf(':')) {
    throw new VerifyPlanError(
      'VERIFY_PLAN_INVALID_ID',
      `${subject} "${reference}" must contain at most one ':' qualifier`,
      { subject, value: reference }
    );
  }

  const plugin = reference.slice(0, separator);
  const localId = reference.slice(separator + 1);
  validateIdSegment(plugin, `${subject} plugin`);
  validateIdSegment(localId, `${subject} local id`);
  return reference as QualifiedStepId;
}

/** @purpose Reject duplicate references that would obscure authored intent after normalization. */
function validateUniqueReferences(
  ownerId: QualifiedStepId,
  references: readonly QualifiedStepId[],
  field: 'needs' | 'invalidates'
): void {
  const seen = new Set<QualifiedStepId>();
  for (const reference of references) {
    if (!seen.has(reference)) {
      seen.add(reference);
      continue;
    }
    throw new VerifyPlanError(
      'VERIFY_PLAN_DUPLICATE_REFERENCE',
      `step "${ownerId}" declares duplicate ${field} reference "${reference}"`,
      { stepId: ownerId, field, reference }
    );
  }
}

/** @purpose Normalize one authored step into its qualified planning representation. */
function normalizeStep(preset: VerifyPreset, step: VerifyStep): PlannedVerifyStep {
  validateIdSegment(step.id, `step id in plugin "${preset.plugin}"`);
  if (step.plugin !== preset.plugin) {
    throw new VerifyPlanError(
      'VERIFY_PLAN_PLUGIN_MISMATCH',
      `step "${step.id}" declares plugin "${step.plugin}" but belongs to preset "${preset.plugin}"`,
      { stepId: step.id, declaredPlugin: step.plugin, presetPlugin: preset.plugin }
    );
  }

  const { invalidates: authoredInvalidates, ...stepWithoutInvalidates } = step;
  const id = qualifyStepId(preset.plugin, step.id);
  const needs = step.needs.map((reference) =>
    normalizeReference(step.plugin, reference, `dependency of "${id}"`)
  );
  const invalidates = authoredInvalidates?.map((reference) =>
    normalizeReference(step.plugin, reference, `invalidation target of "${id}"`)
  );
  validateUniqueReferences(id, needs, 'needs');
  if (invalidates !== undefined) validateUniqueReferences(id, invalidates, 'invalidates');

  if (invalidates === undefined) return { ...stepWithoutInvalidates, id, needs };
  return { ...stepWithoutInvalidates, id, needs, invalidates };
}

/** @purpose Validate selector tags against the preset that declares them. */
function validateSelectors(preset: ValidatedVerifyPreset): void {
  const knownTags = new Set(preset.steps.flatMap((step) => step.tags));
  for (const [phase, selector] of Object.entries(preset.phases)) {
    validateIdSegment(phase, `phase name in plugin "${preset.plugin}"`);
    for (const tag of [...selector.include, ...(selector.exclude ?? [])]) {
      validateIdSegment(tag, `tag in phase "${preset.plugin}:${phase}"`);
      if (knownTags.has(tag)) continue;
      throw new VerifyPlanError(
        'VERIFY_PLAN_UNKNOWN_TAG',
        `phase "${preset.plugin}:${phase}" references unknown tag "${tag}"; known tags: ${
          [...knownTags].sort().join(', ') || 'none'
        }`,
        { plugin: preset.plugin, phase, tag, knownTags: [...knownTags].sort() }
      );
    }
  }
}

/**
 * @purpose Normalize and fail-closed validate a set of plugin-owned verify presets.
 * @param presets Authored presets to compose into one qualified DAG.
 * @returns Validated presets and the complete normalized DAG.
 */
export function validatePlan(presets: readonly VerifyPreset[]): ValidatedVerifyPlan {
  const seenPlugins = new Set<PluginId>();
  const seenSteps = new Set<QualifiedStepId>();
  const normalizedPresets: ValidatedVerifyPreset[] = [];

  for (const preset of presets) {
    validateIdSegment(preset.plugin, 'plugin id');
    if (seenPlugins.has(preset.plugin)) {
      throw new VerifyPlanError(
        'VERIFY_PLAN_DUPLICATE_PLUGIN',
        `plugin "${preset.plugin}" contributes more than one preset`,
        { plugin: preset.plugin }
      );
    }
    seenPlugins.add(preset.plugin);

    const steps = preset.steps.map((step) => normalizeStep(preset, step));
    for (const step of steps) {
      if (seenSteps.has(step.id)) {
        throw new VerifyPlanError(
          'VERIFY_PLAN_DUPLICATE_STEP',
          `qualified step id "${step.id}" occurs more than once`,
          { stepId: step.id }
        );
      }
      seenSteps.add(step.id);
    }

    const normalizedPreset = { plugin: preset.plugin, steps, phases: preset.phases };
    validateSelectors(normalizedPreset);
    normalizedPresets.push(normalizedPreset);
  }

  const steps = normalizedPresets
    .flatMap((preset) => preset.steps)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const stepById = new Map(steps.map((step) => [step.id, step]));

  for (const step of steps) {
    for (const dependencyId of step.needs) {
      if (stepById.has(dependencyId)) continue;
      throw new VerifyPlanError(
        'VERIFY_PLAN_MISSING_DEPENDENCY',
        `step "${step.id}" requires missing dependency "${dependencyId}"`,
        { stepId: step.id, dependencyId }
      );
    }
    for (const invalidatedId of step.invalidates ?? []) {
      if (stepById.has(invalidatedId)) continue;
      throw new VerifyPlanError(
        'VERIFY_PLAN_MISSING_INVALIDATION_TARGET',
        `step "${step.id}" invalidates missing step "${invalidatedId}"`,
        { stepId: step.id, invalidatedId }
      );
    }
  }

  resolveDependencies(
    steps,
    steps.map((step) => step.id)
  );
  return { presets: normalizedPresets, steps };
}
