// @file: Target-only Node planning entrypoint connecting U1 config, composition and phase slicing.
// @consumers: unified planner migration and UV-04 tests
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
import { nodePlugin } from './node-plugin.ts';
import type { NodeProjectFacts } from './node-project.logic.ts';
import { materializeNodeVerifyConfig, nodeDetectedConfig } from './node-target.logic.ts';

/**
 * @purpose Build the Node target plan/config/readiness product without executing any step.
 * @param root Absolute Node repository root.
 * @param phase Exact built-in Node phase name.
 * @param [options] Explicit personal config and Target Files facts.
 * @returns Composed preset, selected plan and readiness snapshot.
 * @sideEffect IO: reads package/config files and existing Target File metadata only.
 */
export function resolveNodeVerifyPlan(
  root: string,
  phase: string,
  options: {
    readonly homeDirectory?: string;
    readonly targetFiles?: readonly string[];
  } = {}
): {
  readonly detection: StackDetection;
  readonly facts: NodeProjectFacts;
  readonly composed: ComposedVerifyPresets;
  readonly plan: VerifyPlan;
  readonly readiness: CapabilityMatrix;
} {
  const detection = nodePlugin.detect(root);
  if (detection === null || nodePlugin.target === undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNKNOWN_PLUGIN',
      'verify.presets.node',
      'Node target planning requires a root package.json',
      'add package.json or select a detected stack plugin'
    );
  }
  const facts = detection.details as NodeProjectFacts;
  const preset = nodePlugin.target.createPreset(detection);
  const targetFiles = normalizeTargetFiles(root, options.targetFiles ?? []);
  const stackLoad = loadStackConfig(
    root,
    BUILTIN_GATE_IDS,
    options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }
  );
  const pipelineIssue = targetStackPipelineIssue(stackLoad.config, ['node']);
  if (pipelineIssue !== null) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      pipelineIssue.path,
      `${pipelineIssue.sourceField} belongs to the removed stack gate pipeline`,
      'move executable steps and waivers to verify.presets.node'
    );
  }
  if (stackLoad.errors[0] !== undefined) {
    const error = stackLoad.errors[0];
    throw new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      error.path,
      error.message,
      'move executable steps to verify.presets.node.steps'
    );
  }
  const files = materializeNodeVerifyConfig(
    loadVerifyConfig(root, [preset], options.homeDirectory),
    facts,
    targetFiles
  );
  if (files.errors[0] !== undefined) throw files.errors[0];

  const composed = composePresets({
    presets: [preset],
    detected: [nodeDetectedConfig(preset, facts, targetFiles)],
    files,
  });
  const composedPreset = composed.presets[0]!;
  const plan = selectPhase(composed.presets, phase);
  return {
    detection,
    facts,
    composed,
    plan,
    readiness: nodePlugin.target.evaluateReadiness(
      detection,
      composedPreset,
      plan,
      composed.waivers
    ),
  };
}
