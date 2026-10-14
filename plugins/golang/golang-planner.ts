// @file: Target-only Go planning entrypoint connecting shared config, DAG composition and slicing.
// @consumers: unified affected-stack planner and UV-05 tests
// @spec: CLI-VERIFY

import { loadVerifyConfig } from '../../shared/verify/config/load-verify-config.ts';
import { VerifyConfigError } from '../../shared/verify/config/verify-config.error.ts';
import type { ComposedVerifyPresets } from '../../shared/verify/config/verify-config.type.ts';
import type { CapabilityMatrix } from '../../shared/verify/model/verify-readiness.type.ts';
import type { VerifyPlan } from '../../shared/verify/model/verify-report.type.ts';
import { composePresets } from '../../shared/verify/planning/compose-presets.ts';
import { normalizeTargetFiles } from '../../shared/verify/planning/normalize-target-files.ts';
import { selectPhase } from '../../shared/verify/planning/select-phase.ts';
import { loadStackConfig, targetStackPipelineIssue } from '../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../shared/verify/stack-registry.ts';
import type { StackDetection } from '../../shared/verify/verify.types.ts';
import type { GoProject } from './golang-detect.logic.ts';
import { golangPlugin } from './golang-plugin.ts';
import { resolveGoScope, type GoScope } from './golang-scope.logic.ts';
import {
  createGolangVerifyPreset,
  golangDetectedConfig,
  materializeGolangVerifyConfig,
} from './golang-target.logic.ts';

/**
 * @purpose Build the Go target plan/config/readiness product without executing any step.
 * @param root Absolute Go repository root.
 * @param phase Exact built-in Go phase name.
 * @param [options] Explicit personal config and Target Files facts.
 * @returns Detection, composed preset, selected plan and readiness snapshot.
 */
export function resolveGolangVerifyPlan(
  root: string,
  phase: string,
  options: {
    readonly homeDirectory?: string;
    readonly targetFiles?: readonly string[];
  } = {}
): {
  readonly detection: StackDetection;
  readonly project: GoProject;
  readonly scope: GoScope;
  readonly composed: ComposedVerifyPresets;
  readonly plan: VerifyPlan;
  readonly readiness: CapabilityMatrix;
} {
  const detection = golangPlugin.detect(root);
  if (detection === null || golangPlugin.target === undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNKNOWN_PLUGIN',
      'verify.presets.golang',
      'Go target planning requires a root go.mod',
      'add go.mod or select a detected stack plugin'
    );
  }
  const project = detection.details as GoProject;
  const targetFiles = normalizeTargetFiles(root, options.targetFiles ?? []);
  const goTargets = targetFiles.filter((candidate) => candidate.endsWith('.go'));
  const scope = resolveGoScope(project, {
    mode: targetFiles.length === 0 ? 'all' : 'files',
    targets: goTargets,
  });
  const preset = createGolangVerifyPreset(detection, scope);
  const stackLoad = loadStackConfig(
    root,
    BUILTIN_GATE_IDS,
    options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }
  );
  const pipelineIssue = targetStackPipelineIssue(stackLoad.config, ['golang']);
  if (pipelineIssue !== null) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      pipelineIssue.path,
      `${pipelineIssue.sourceField} belongs to the removed stack gate pipeline`,
      'move executable steps and waivers to verify.presets.golang'
    );
  }
  if (stackLoad.errors[0] !== undefined) {
    const error = stackLoad.errors[0];
    throw new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      error.path,
      error.message,
      'move executable steps to verify.presets.golang.steps'
    );
  }
  const files = materializeGolangVerifyConfig(
    loadVerifyConfig(root, [preset], options.homeDirectory),
    scope
  );
  if (files.errors[0] !== undefined) throw files.errors[0];

  const composed = composePresets({
    presets: [preset],
    detected: [golangDetectedConfig(preset, scope)],
    files,
  });
  const composedPreset = composed.presets[0]!;
  const plan = selectPhase(composed.presets, phase);
  return {
    detection,
    project,
    scope,
    composed,
    plan,
    readiness: golangPlugin.target.evaluateReadiness(
      detection,
      composedPreset,
      plan,
      composed.waivers
    ),
  };
}
