// @file: Target-only Node planning entrypoint connecting U1 config, composition and phase slicing.
// @consumers: unified planner migration and UV-04 tests
// @spec: CLI-VERIFY

import fs from 'node:fs';
import path from 'node:path';
import { adaptLegacyStackConfig } from '../../shared/verify/config/adapt-legacy-stack-config.ts';
import { loadVerifyConfig } from '../../shared/verify/config/load-verify-config.ts';
import { VerifyConfigError } from '../../shared/verify/config/verify-config.error.ts';
import type { ComposedVerifyPresets } from '../../shared/verify/config/verify-config.type.ts';
import type { CapabilityMatrix } from '../../shared/verify/model/verify-readiness.type.ts';
import type { VerifyPlan } from '../../shared/verify/model/verify-report.type.ts';
import { composePresets } from '../../shared/verify/planning/compose-presets.ts';
import { selectPhase } from '../../shared/verify/planning/select-phase.ts';
import { loadStackConfig } from '../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../shared/verify/stack-registry.ts';
import type { StackDetection } from '../../shared/verify/verify.types.ts';
import { nodePlugin } from './node-plugin.ts';
import type { NodeProjectFacts } from './node-project.logic.ts';
import {
  materializeLegacyNodeCommands,
  materializeNodeVerifyConfig,
  nodeDetectedConfig,
} from './node-target.logic.ts';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedTargetFiles(root: string, values: readonly string[]): readonly string[] {
  const normalizedRoot = path.resolve(root);
  const files = values.map((value, index) => {
    const keyPath = `scope.targetFiles[${index}]`;
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value !== value.trim() ||
      value.includes('\\') ||
      value.includes('\0') ||
      value.endsWith('/') ||
      value.endsWith('/.') ||
      value.endsWith('/..') ||
      /[*?\[\]{}]/.test(value) ||
      path.isAbsolute(value) ||
      path.win32.isAbsolute(value)
    ) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Target File ${JSON.stringify(value)} is not an exact repo-relative path`,
        'pass a non-empty relative file path with forward slashes and no glob syntax'
      );
    }
    const absolute = path.resolve(normalizedRoot, value);
    const relative = path.relative(normalizedRoot, absolute);
    if (
      relative.length === 0 ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Target File ${JSON.stringify(value)} escapes or names the repository root`,
        'pass an exact file contained by the repository root'
      );
    }
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Target File ${JSON.stringify(value)} names a directory`,
        'pass exact files rather than a directory scope'
      );
    }
    return relative.split(path.sep).join('/');
  });
  return [...new Set(files)].sort(compareText);
}

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
  const targetFiles = normalizedTargetFiles(root, options.targetFiles ?? []);
  const files = materializeNodeVerifyConfig(
    loadVerifyConfig(root, [preset], options.homeDirectory),
    facts,
    targetFiles
  );
  if (files.errors[0] !== undefined) throw files.errors[0];

  const gateIds = preset.steps.map((candidate) => candidate.id);
  const legacyLoad = loadStackConfig(
    root,
    { ...BUILTIN_GATE_IDS, node: gateIds },
    options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }
  );
  if (legacyLoad.errors[0] !== undefined) {
    const error = legacyLoad.errors[0];
    throw new VerifyConfigError(
      'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      error.path,
      error.message,
      'migrate this stack.node entry to verify.presets.node before target planning'
    );
  }
  const legacy = materializeLegacyNodeCommands(
    adaptLegacyStackConfig(root, [preset], legacyLoad.config, legacyLoad.provenance),
    targetFiles
  );
  if (legacy.errors[0] !== undefined) throw legacy.errors[0];

  const composed = composePresets({
    presets: [preset],
    detected: [nodeDetectedConfig(preset, facts, targetFiles)],
    legacy,
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
