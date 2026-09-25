// @file: Read-only scope-aware multistack target preset orchestration.
// @consumers: unified verify planner migration and UV-07 tests
// @spec: CLI-VERIFY

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { anystackPlugin } from '../../../plugins/anystack/anystack-plugin.ts';
import type { GoProject } from '../../../plugins/golang/golang-detect.logic.ts';
import { isGolangScopePath, resolveGoScope } from '../../../plugins/golang/golang-scope.logic.ts';
import {
  createGolangVerifyPreset,
  golangDetectedConfig,
  materializeGolangVerifyConfig,
  materializeLegacyGolangCommands,
} from '../../../plugins/golang/golang-target.logic.ts';
import type { NodeProjectFacts } from '../../../plugins/node/node-project.logic.ts';
import {
  materializeLegacyNodeCommands,
  materializeNodeVerifyConfig,
  nodeDetectedConfig,
} from '../../../plugins/node/node-target.logic.ts';
import type { SwiftProject } from '../../../plugins/swift/swift-detect.logic.ts';
import {
  createSwiftVerifyPreset,
  materializeLegacySwiftCommands,
  materializeSwiftVerifyConfig,
  swiftDetectedConfig,
} from '../../../plugins/swift/swift-target.logic.ts';
import { adaptLegacyStackConfig } from '../config/adapt-legacy-stack-config.ts';
import { loadVerifyConfig } from '../config/load-verify-config.ts';
import { VerifyConfigError } from '../config/verify-config.error.ts';
import type {
  DetectedVerifyConfigLayer,
  LegacyVerifyConfigAdapter,
  VerifyConfigLoad,
} from '../config/verify-config.type.ts';
import type { PluginId } from '../model/plugin-id.type.ts';
import type { VerifyScope } from '../model/verify-context.type.ts';
import type { MultistackVerifyPlan } from '../model/verify-multistack.type.ts';
import type { VerifyPreset } from '../model/verify-preset.type.ts';
import type { VerifyReadiness } from '../model/verify-readiness.type.ts';
import { loadStackConfig } from '../stack-config.ts';
import { detectTargetStacks } from '../stack-detection.ts';
import {
  BUILTIN_GATE_IDS,
  BUILTIN_STACK_PLUGINS,
  detectStacks,
  type ActiveStack,
} from '../stack-registry.ts';
import type { StackConfig } from '../verify.types.ts';
import { composePresets } from './compose-presets.ts';
import { normalizeTargetFiles } from './normalize-target-files.ts';
import { selectPhase } from './select-phase.ts';

type PreparedStack = {
  readonly active: ActiveStack;
  readonly preset: VerifyPreset;
  readonly detected?: DetectedVerifyConfigLayer;
  readonly nodeTargetFiles?: readonly string[];
  readonly goScope?: ReturnType<typeof resolveGoScope>;
  readonly swiftTargetFiles?: readonly string[];
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @purpose Accept an exact Git-style ref or commit identity, never a revision expression/range.
 * @param value Candidate base supplied by the scope resolver.
 * @returns True when the identity is stable and safe to preserve as a resolved-scope source.
 */
function exactChangedBase(value: string): boolean {
  if (
    value === '@' ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    value.includes('..') ||
    value.includes('@{') ||
    /[\0-\x20\x7f~^:?*[\]\\]/.test(value)
  ) {
    return false;
  }
  return value
    .split('/')
    .every(
      (component) =>
        component.length > 0 &&
        !component.startsWith('.') &&
        !component.endsWith('.') &&
        !component.endsWith('.lock')
    );
}

/**
 * @purpose Enforce coherent changed-scope/base identity before affected-stack selection.
 * @param scope Caller-resolved file scope.
 * @returns Validated exact base for changed mode, otherwise undefined.
 */
function changedBaseOf(scope: VerifyScope): string | undefined {
  const value = scope.changedFrom;
  if (scope.mode !== 'changed') {
    if (value !== undefined) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        'scope.changedFrom',
        'changedFrom is only valid for mode=changed',
        'remove changedFrom or select changed scope explicitly'
      );
    }
    return undefined;
  }
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !exactChangedBase(value)
  ) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_INVALID_TYPE',
      'scope.changedFrom',
      'mode=changed requires an exact non-empty VCS base identity',
      'pass the unmodified base ref or commit used to resolve scope.files'
    );
  }
  return value;
}

function normalizeScope(
  root: string,
  scope: VerifyScope,
  knownDeletedFiles: readonly string[] = []
): VerifyScope {
  const changedFrom = changedBaseOf(scope);
  if (scope.mode === 'all' || scope.files.length === 0) {
    return {
      mode: scope.mode,
      files: [],
      ...(changedFrom === undefined ? {} : { changedFrom }),
    };
  }
  const values = [...new Set(scope.files)].sort(compareText);
  const existing = values.filter((value) => fs.existsSync(path.resolve(root, value)));
  const normalizedExisting = normalizeTargetFiles(root, existing);
  const missing = values.filter((value) => !fs.existsSync(path.resolve(root, value)));
  const normalizedMissing: string[] = [];
  for (const value of missing) {
    const absolute = path.resolve(root, value);
    const relative = path.relative(root, absolute);
    if (
      value.length === 0 ||
      value !== value.trim() ||
      value.includes('\\') ||
      value.includes('\0') ||
      /[*?\[\]{}]/.test(value) ||
      path.isAbsolute(value) ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        'scope.files',
        `scope path ${JSON.stringify(value)} is not repo-relative`,
        'use normalized repository-relative paths from the resolved diff scope'
      );
    }
    normalizedMissing.push(relative.split(path.sep).join('/'));
  }
  const normalizedKnownDeleted = new Set(
    knownDeletedFiles.map((value) => {
      const absolute = path.resolve(root, value);
      const relative = path.relative(root, absolute);
      if (
        value.length === 0 ||
        value !== value.trim() ||
        value.includes('\\') ||
        value.includes('\0') ||
        /[*?\[\]{}]/.test(value) ||
        path.isAbsolute(value) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          'scope.deletedFiles',
          `deleted scope path ${JSON.stringify(value)} is not repo-relative`,
          'use exact normalized tombstones from the resolved SDD phase'
        );
      }
      return relative.split(path.sep).join('/');
    })
  );
  if (
    scope.mode === 'files' &&
    normalizedMissing.some((value) => !normalizedKnownDeleted.has(value))
  ) {
    normalizeTargetFiles(root, values);
  }
  return {
    ...scope,
    ...(changedFrom === undefined ? {} : { changedFrom }),
    files: [...new Set([...normalizedExisting, ...normalizedMissing])].sort(compareText),
  };
}

function walkProjectFiles(root: string, directory = root): readonly string[] {
  const files: string[] = [];
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...walkProjectFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files;
}

function allProjectFiles(root: string): readonly string[] {
  try {
    const output = execFileSync(
      'git',
      ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return output.toString('utf8').split('\0').filter(Boolean).sort(compareText);
  } catch {
    return walkProjectFiles(root);
  }
}

function existingTargetFiles(root: string, scope: VerifyScope): readonly string[] {
  const files = scope.mode === 'all' ? allProjectFiles(root) : scope.files;
  return normalizeTargetFiles(
    root,
    files.filter((value) => {
      const entry = fs.lstatSync(path.resolve(root, value), { throwIfNoEntry: false });
      return entry?.isFile() === true && !entry.isSymbolicLink();
    })
  );
}

function rootConfigInScope(scope: VerifyScope): boolean {
  return scope.files.some((file) => file === 'gennady.yaml' || file === '.gennadyrc');
}

function nodeRepairTarget(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file);
}

function prepareStack(
  active: ActiveStack,
  scope: VerifyScope,
  targetFiles: readonly string[],
  forceAll = false
): PreparedStack {
  const { plugin, detection } = active;
  if (plugin.target === undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNKNOWN_PLUGIN',
      `verify.presets.${plugin.id}`,
      `detected plugin "${plugin.id}" has no target preset`,
      'complete the plugin target conversion before using unified multistack planning'
    );
  }
  if (plugin.id === 'node') {
    const facts = detection.details as NodeProjectFacts;
    const nodeTargetFiles = targetFiles.filter(nodeRepairTarget);
    const preset = plugin.target.createPreset(detection);
    return {
      active,
      preset,
      detected: nodeDetectedConfig(preset, facts, nodeTargetFiles),
      nodeTargetFiles,
    };
  }
  if (plugin.id === 'golang') {
    const project = detection.details as GoProject;
    const widened =
      forceAll ||
      scope.mode === 'all' ||
      scope.files.length === 0 ||
      scope.files.some((file) => isGolangScopePath(file) && !file.endsWith('.go'));
    const goScope = resolveGoScope(project, {
      mode: widened ? 'all' : 'files',
      targets: widened ? [] : targetFiles.filter((file) => file.endsWith('.go')),
    });
    const preset = createGolangVerifyPreset(detection, goScope);
    return { active, preset, detected: golangDetectedConfig(preset, goScope), goScope };
  }
  if (plugin.id === 'swift') {
    const swiftTargetFiles = targetFiles.filter((file) => file.endsWith('.swift'));
    const preset = createSwiftVerifyPreset(detection, swiftTargetFiles);
    return {
      active,
      preset,
      detected: swiftDetectedConfig(preset, swiftTargetFiles),
      swiftTargetFiles,
    };
  }
  return { active, preset: plugin.target.createPreset(detection) };
}

function filterConfigLoad(
  load: VerifyConfigLoad,
  plugins: ReadonlySet<PluginId>
): VerifyConfigLoad {
  if (load.config === null) return load;
  return {
    ...load,
    config: {
      presets: Object.fromEntries(
        Object.entries(load.config.presets).filter(([plugin]) => plugins.has(plugin))
      ),
    },
  };
}

function selectedStackConfig(
  config: StackConfig | null,
  plugins: ReadonlySet<PluginId>
): StackConfig | null {
  if (config === null) return null;
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => key === 'use' || plugins.has(key))
  );
}

function materializeFiles(
  loaded: VerifyConfigLoad,
  prepared: readonly PreparedStack[]
): VerifyConfigLoad {
  let result = loaded;
  for (const stack of prepared) {
    if (stack.active.plugin.id === 'node') {
      result = materializeNodeVerifyConfig(
        result,
        stack.active.detection.details as NodeProjectFacts,
        stack.nodeTargetFiles
      );
    } else if (stack.active.plugin.id === 'golang') {
      result = materializeGolangVerifyConfig(result, stack.goScope!);
    } else if (stack.active.plugin.id === 'swift') {
      result = materializeSwiftVerifyConfig(
        result,
        stack.active.detection.details as SwiftProject,
        stack.swiftTargetFiles!
      );
    }
  }
  return result;
}

function materializeLegacy(
  adapter: LegacyVerifyConfigAdapter,
  prepared: readonly PreparedStack[],
  stackConfig: StackConfig | null,
  provenance: ReadonlyMap<string, string>
): LegacyVerifyConfigAdapter {
  let result = adapter;
  for (const stack of prepared) {
    if (stack.active.plugin.id === 'node') {
      result = materializeLegacyNodeCommands(result, stack.nodeTargetFiles);
    } else if (stack.active.plugin.id === 'golang') {
      result = materializeLegacyGolangCommands(result);
    } else if (stack.active.plugin.id === 'swift') {
      result = materializeLegacySwiftCommands(
        result,
        stack.active.detection.details as SwiftProject,
        stackConfig,
        provenance
      );
    }
  }
  return result;
}

function stackConfigError(error: { readonly path: string; readonly message: string }): never {
  throw new VerifyConfigError(
    'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
    error.path,
    error.message,
    'fix the strict stack config before target multistack planning'
  );
}

/**
 * @purpose Compose and slice one target DAG across every scope-affected detected plugin.
 * @param root Absolute repository root.
 * @param phase Exact common target phase.
 * @param options Resolved scope and optional personal-config directory.
 * @returns Detection, participation, provenance, one plan and policy-aware readiness.
 */
export function resolveMultistackVerifyPlan(
  root: string,
  phase: string,
  options: {
    readonly scope: VerifyScope;
    readonly homeDirectory?: string;
    /** @purpose Exact SDD tombstones allowed to be absent while still affecting plugin scope. */
    readonly knownDeletedFiles?: readonly string[];
  }
): MultistackVerifyPlan {
  const scope = normalizeScope(root, options.scope, options.knownDeletedFiles);
  const targetFiles = existingTargetFiles(root, scope);
  const allDetected = detectStacks(root, null, BUILTIN_STACK_PLUGINS).filter(
    (entry) => entry.plugin.target !== undefined
  );
  const vocabulary = allDetected.map((active) =>
    prepareStack(active, { mode: 'all', files: [] }, [])
  );
  const gateIds = {
    ...BUILTIN_GATE_IDS,
    ...Object.fromEntries(
      vocabulary.map((stack) => [stack.active.plugin.id, stack.preset.steps.map((step) => step.id)])
    ),
  };
  const stackLoad = loadStackConfig(
    root,
    gateIds,
    options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }
  );
  if (stackLoad.errors[0] !== undefined) stackConfigError(stackLoad.errors[0]);

  const selected = [...detectTargetStacks(root, stackLoad.config)];
  const globalScope = rootConfigInScope(scope);
  const initiallyAffected = selected.filter(
    ({ plugin, detection }) => globalScope || plugin.target?.affectsScope(detection, scope) === true
  );
  if (
    initiallyAffected.length === 0 &&
    scope.mode !== 'all' &&
    scope.files.length > 0 &&
    stackLoad.config?.use === undefined
  ) {
    const fallback = allDetected.find((entry) => entry.plugin.id === anystackPlugin.id);
    if (
      fallback !== undefined &&
      !selected.some((entry) => entry.plugin.id === fallback.plugin.id)
    ) {
      selected.push(fallback);
    }
  }
  if (selected.length === 0) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNKNOWN_PLUGIN',
      'stack.use',
      'stack.use matched no detected target plugin',
      'remove absent ids or include anystack explicitly for project-owned declarative verification'
    );
  }

  const affected = new Set(
    selected
      .filter(
        ({ plugin, detection }) =>
          globalScope || plugin.target?.affectsScope(detection, scope) === true
      )
      .map((entry) => entry.plugin.id)
  );
  if (affected.size === 0) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_INVALID_PLAN',
      'scope.files',
      `no selected stack owns scope: ${scope.files.join(', ')}`,
      'include anystack explicitly or select files owned by a detected plugin'
    );
  }

  const prepared = selected.map((active) =>
    prepareStack(active, scope, targetFiles, !affected.has(active.plugin.id))
  );
  const presets = prepared.map((stack) => stack.preset);
  const selectedIds = new Set(selected.map((entry) => entry.plugin.id));
  let files = loadVerifyConfig(
    root,
    vocabulary.map((stack) => stack.preset),
    options.homeDirectory
  );
  if (files.errors[0] !== undefined) throw files.errors[0];
  files = filterConfigLoad(materializeFiles(files, prepared), selectedIds);
  if (files.errors[0] !== undefined) throw files.errors[0];

  const scopedStackConfig = selectedStackConfig(stackLoad.config, selectedIds);
  let legacy = adaptLegacyStackConfig(root, presets, scopedStackConfig, stackLoad.provenance);
  legacy = materializeLegacy(legacy, prepared, scopedStackConfig, stackLoad.provenance);
  if (legacy.errors[0] !== undefined) throw legacy.errors[0];

  const composed = composePresets({
    presets,
    detected: prepared.flatMap((stack) => (stack.detected === undefined ? [] : [stack.detected])),
    legacy,
    files,
  });
  const plan = selectPhase(composed.presets, phase, [...affected]);
  const planPlugins = new Set(plan.steps.map((step) => step.plugin));
  const policyByPlugin = new Map(composed.policies.map((policy) => [policy.plugin, policy]));
  const stacks = prepared.map(({ active }) => {
    const policy = policyByPlugin.get(active.plugin.id)!;
    return {
      plugin: active.plugin.id,
      participation: affected.has(active.plugin.id)
        ? ('affected' as const)
        : planPlugins.has(active.plugin.id)
          ? ('dependency' as const)
          : ('unaffected' as const),
      blocking: policy.blocking,
      ...(policy.reason === undefined ? {} : { policyReason: policy.reason }),
      policySource: policy.source,
      ...(policy.reasonSource === undefined ? {} : { policyReasonSource: policy.reasonSource }),
    };
  });

  const entries: VerifyReadiness[] = [];
  for (const stack of prepared) {
    const participation = stacks.find((candidate) => candidate.plugin === stack.active.plugin.id)!;
    if (participation.participation === 'unaffected') continue;
    const plugin = stack.active.plugin;
    const preset = composed.presets.find((candidate) => candidate.plugin === plugin.id)!;
    const matrix = plugin.target!.evaluateReadiness(
      stack.active.detection,
      preset,
      plan,
      composed.waivers
    );
    entries.push(
      ...matrix.entries.map((entry) => ({
        ...entry,
        blocking: participation.blocking,
        ...(participation.policyReason === undefined
          ? {}
          : {
              policyReason: participation.policyReason,
              policySource: participation.policySource,
              policyReasonSource: participation.policyReasonSource,
            }),
      }))
    );
    if (!participation.blocking) {
      entries.push({
        plugin: plugin.id,
        phase,
        requirementId: `${plugin.id}:policy:non-blocking`,
        status: 'DEGRADED',
        message: `${plugin.id} is explicitly non-blocking: ${participation.policyReason}`,
        blocking: false,
        policyReason: participation.policyReason,
        policySource: participation.policySource,
        policyReasonSource: participation.policyReasonSource,
      });
    }
  }
  const readiness = {
    status: entries.some((entry) => entry.status === 'BLOCKED' && entry.blocking !== false)
      ? ('BLOCKED' as const)
      : entries.some((entry) => entry.status !== 'READY')
        ? ('DEGRADED' as const)
        : ('READY' as const),
    entries,
  };
  return {
    scope,
    detections: prepared.map((stack) => stack.active.detection),
    stacks,
    composed,
    plan,
    readiness,
  };
}
