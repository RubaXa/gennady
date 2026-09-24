// @file: Target-only Swift planning entrypoint connecting shared config, DAG composition and slicing.
// @consumers: affected-stack planner and UV-06 tests
// @spec: CLI-VERIFY

import { adaptLegacyStackConfig } from '../../shared/verify/config/adapt-legacy-stack-config.ts';
import { loadVerifyConfig } from '../../shared/verify/config/load-verify-config.ts';
import { VerifyConfigError } from '../../shared/verify/config/verify-config.error.ts';
import type { ComposedVerifyPresets } from '../../shared/verify/config/verify-config.type.ts';
import type { CapabilityMatrix } from '../../shared/verify/model/verify-readiness.type.ts';
import type { VerifyPlan } from '../../shared/verify/model/verify-report.type.ts';
import { composePresets } from '../../shared/verify/planning/compose-presets.ts';
import { normalizeTargetFiles } from '../../shared/verify/planning/normalize-target-files.ts';
import { selectPhase } from '../../shared/verify/planning/select-phase.ts';
import { loadStackConfig } from '../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../shared/verify/stack-registry.ts';
import type { StackDetection } from '../../shared/verify/verify.types.ts';
import type { SwiftProject } from './swift-detect.logic.ts';
import { swiftPlugin } from './swift-plugin.ts';
import { resolveSwiftScope, type SwiftScope } from './swift-scope.logic.ts';
import {
  createSwiftVerifyPreset,
  materializeLegacySwiftCommands,
  materializeSwiftVerifyConfig,
  swiftDetectedConfig,
} from './swift-target.logic.ts';

/**
 * @purpose Build the Swift target plan/config/readiness product without executing any step.
 * @param root Absolute Swift repository root.
 * @param phase Exact built-in phase name.
 * @param [options] Explicit personal config and exact Target Files facts.
 * @returns Detection, scope, composed preset, selected plan and readiness snapshot.
 */
export function resolveSwiftVerifyPlan(
  root: string,
  phase: string,
  options: {
    readonly homeDirectory?: string;
    readonly targetFiles?: readonly string[];
  } = {}
): {
  readonly detection: StackDetection;
  readonly project: SwiftProject;
  readonly scope: SwiftScope;
  readonly composed: ComposedVerifyPresets;
  readonly plan: VerifyPlan;
  readonly readiness: CapabilityMatrix;
} {
  const detection = swiftPlugin.detect(root);
  if (detection === null || swiftPlugin.target === undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNKNOWN_PLUGIN',
      'verify.presets.swift',
      'Swift target planning requires a root SwiftPM or Xcode/Tuist marker',
      'add root Package.swift or a checked-in Xcode/Tuist project definition'
    );
  }
  const project = detection.details as SwiftProject;
  const targetFiles = normalizeTargetFiles(root, options.targetFiles ?? []);
  const swiftTargets = targetFiles.filter((candidate) => candidate.endsWith('.swift'));
  const scope = resolveSwiftScope(project, {
    mode: targetFiles.length === 0 ? 'all' : 'files',
    targets: swiftTargets,
  });
  const preset = createSwiftVerifyPreset(detection, swiftTargets);
  const files = materializeSwiftVerifyConfig(
    loadVerifyConfig(root, [preset], options.homeDirectory),
    project,
    swiftTargets
  );
  if (files.errors[0] !== undefined) throw files.errors[0];

  const legacyLoad = loadStackConfig(
    root,
    BUILTIN_GATE_IDS,
    options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }
  );
  if (legacyLoad.errors[0] !== undefined) {
    const error = legacyLoad.errors[0];
    throw new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      error.path,
      error.message,
      'fix stack.swift or migrate pipeline overrides to verify.presets.swift'
    );
  }
  const legacy = materializeLegacySwiftCommands(
    adaptLegacyStackConfig(root, [preset], legacyLoad.config, legacyLoad.provenance),
    project,
    legacyLoad.config,
    legacyLoad.provenance
  );
  if (legacy.errors[0] !== undefined) throw legacy.errors[0];

  const composed = composePresets({
    presets: [preset],
    detected: [swiftDetectedConfig(preset, swiftTargets)],
    legacy,
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
    readiness: swiftPlugin.target.evaluateReadiness(
      detection,
      composedPreset,
      plan,
      composed.waivers
    ),
  };
}
