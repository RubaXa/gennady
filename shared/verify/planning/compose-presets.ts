// @file: Deterministic target verify config overlay over concrete plugin presets.
// @consumers: UV-04..06 preset adapters and future verify planning entry point
// @spec: CLI-VERIFY

import { provenanceOf } from '../../../services/config/config-loader.ts';
import type { PluginId } from '../model/plugin-id.type.ts';
import type { VerifyPreset, VerifyStepOverride } from '../model/verify-preset.type.ts';
import type { LocalCommand, VerifyStep } from '../model/verify-step.type.ts';
import { VerifyConfigError } from '../config/verify-config.error.ts';
import type {
  ComposedVerifyPresets,
  ComposeVerifyPresetsInput,
  VerifyConfig,
  VerifyPluginPolicy,
  VerifyStepConfig,
  VerifyStepWaiver,
} from '../config/verify-config.type.ts';
import { validatePlan } from './validate-plan.ts';
import { VerifyPlanError } from './verify-plan.error.ts';

type OverlayLayer = {
  readonly config: VerifyConfig;
  readonly defaultSource: string;
  readonly provenance: ReadonlyMap<string, string>;
};

/** @purpose Compare strings by locale-independent UTF-16 code-unit order. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @purpose Copy a string map into deterministic key order. */
function orderedStringMap(
  value: Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => compareText(left, right))
  );
}

/** @purpose Copy one preset so composition never mutates plugin-owned input data. */
function clonePreset(preset: VerifyPreset): VerifyPreset {
  return {
    plugin: preset.plugin,
    steps: preset.steps.map((step) => ({
      ...step,
      tags: [...step.tags],
      needs: [...step.needs],
      command:
        step.command === undefined
          ? undefined
          : {
              ...step.command,
              argv: [...step.command.argv],
              env: orderedStringMap(step.command.env),
            },
      requires: step.requires.map((requirement) => ({
        ...requirement,
        probe:
          requirement.probe === undefined
            ? undefined
            : {
                ...requirement.probe,
                argv: [...requirement.probe.argv],
                env: orderedStringMap(requirement.probe.env),
              },
      })),
      writes:
        step.writes === undefined
          ? undefined
          : {
              ...step.writes,
              include: [...step.writes.include],
              exclude: step.writes.exclude === undefined ? undefined : [...step.writes.exclude],
            },
      invalidates: step.invalidates === undefined ? undefined : [...step.invalidates],
    })),
    phases: Object.fromEntries(
      Object.entries(preset.phases)
        .sort(([left], [right]) => compareText(left, right))
        .map(([phase, selector]) => [
          phase,
          {
            include: [...selector.include],
            exclude: selector.exclude === undefined ? undefined : [...selector.exclude],
          },
        ])
    ),
    sddKinds: Object.fromEntries(
      Object.entries(preset.sddKinds).sort(([left], [right]) => compareText(left, right))
    ),
    requirements: preset.requirements.map((requirement) => ({ ...requirement })),
    rules: [...preset.rules],
  };
}

/** @purpose Materialize a complete project-owned local step without hidden pipeline defaults. */
function materializeCustomStep(
  plugin: string,
  stepId: string,
  config: VerifyStepConfig,
  keyPath: string,
  layer: OverlayLayer
): VerifyStep {
  const command = config.command;
  if (
    config.tags === undefined ||
    config.executor !== 'local' ||
    config.effect === undefined ||
    command?.argv === undefined ||
    command.cwd === undefined ||
    config.timeoutMs === undefined ||
    config.onFailure === undefined
  ) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_COMMAND_INCOMPLETE',
      keyPath,
      'custom step is not a complete direct-argv local step',
      'declare tags, executor: local, effect, command.argv/cwd, timeout and onFailure',
      layerSource(layer, keyPath)
    );
  }
  if (command.npmScript !== undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED',
      `${keyPath}.command.npmScript`,
      'custom npmScript shorthand was not materialized by the owning plugin',
      'use direct command.argv/cwd or let the Node planner materialize the script before composition',
      layerSource(layer, `${keyPath}.command.npmScript`)
    );
  }
  return {
    id: stepId,
    plugin,
    tags: config.tags,
    needs: config.needs ?? [],
    executor: 'local',
    effect: config.effect,
    command: {
      argv: command.argv,
      cwd: command.cwd,
      ...(command.env === undefined ? {} : { env: orderedStringMap(command.env) }),
      timeoutMs: config.timeoutMs,
    },
    requires: config.requires ?? [],
    ...(config.outputMeansFailure === undefined
      ? {}
      : { outputMeansFailure: config.outputMeansFailure }),
    ...(config.envFail === undefined
      ? {}
      : { envFail: config.envFail.map((rule) => ({ ...rule })) }),
    ...(config.writes === undefined ? {} : { writes: config.writes }),
    ...(config.invalidates === undefined ? {} : { invalidates: config.invalidates }),
    timeoutMs: config.timeoutMs,
    onFailure: config.onFailure,
  };
}

/** @purpose Attribute every builtin leaf, treating arrays as replaceable leaf values. */
function recordLeafProvenance(
  value: unknown,
  keyPath: string,
  source: string,
  provenance: Map<string, string>
): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    provenance.set(keyPath, source);
    return;
  }
  for (const [key, child] of Object.entries(value).sort(([left], [right]) =>
    compareText(left, right)
  )) {
    recordLeafProvenance(child, `${keyPath}.${key}`, source, provenance);
  }
}

/** @purpose Resolve a winning layer source from full or section-relative provenance keys. */
function layerSource(layer: OverlayLayer, keyPath: string, authoredField?: string): string {
  const relative = keyPath.replace(/^verify\./, '');
  const authoredPath =
    authoredField === undefined
      ? relative
      : `${relative.slice(0, relative.lastIndexOf('.') + 1)}${authoredField}`;
  return (
    provenanceOf(layer.provenance, keyPath) ??
    provenanceOf(layer.provenance, authoredPath) ??
    provenanceOf(layer.provenance, relative) ??
    layer.defaultSource
  );
}

/** @purpose Materialize the public VerifyStepOverride contract over one concrete base step. */
function materializeOverride(
  step: VerifyStep,
  config: VerifyStepConfig,
  keyPath: string,
  layer: OverlayLayer
): VerifyStepOverride {
  if (
    config.enabled === false &&
    (config.reason === undefined || config.reason.trim().length === 0)
  ) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_DISABLE_REASON_REQUIRED',
      `${keyPath}.reason`,
      'explicit disable requires a non-empty reason',
      'add reason: <why this verification is waived>',
      layerSource(layer, `${keyPath}.enabled`)
    );
  }
  if (config.command?.npmScript !== undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED',
      `${keyPath}.command.npmScript`,
      `Node script shorthand "${config.command.npmScript}" needs package-manager facts`,
      'UV-04 Node preset resolution must translate npmScript to argv; use command.argv for a generic override today',
      layerSource(layer, `${keyPath}.command.npmScript`)
    );
  }

  let command: LocalCommand | undefined;
  if (config.command !== undefined || config.timeoutMs !== undefined) {
    const argv = config.command?.argv ?? step.command?.argv;
    const cwd = config.command?.cwd ?? step.command?.cwd;
    if (config.command !== undefined && (argv === undefined || cwd === undefined)) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_COMMAND_INCOMPLETE',
        `${keyPath}.command`,
        'cannot materialize a command override because the preset has no inheritable argv/cwd',
        'provide both command.argv and command.cwd, or wait for the owning preset conversion',
        layerSource(layer, `${keyPath}.command`)
      );
    }
    if (argv !== undefined && cwd !== undefined) {
      command = {
        argv,
        cwd,
        env: orderedStringMap(
          config.command?.env === undefined
            ? step.command?.env
            : { ...step.command?.env, ...config.command.env }
        ),
        timeoutMs: config.timeoutMs ?? step.command?.timeoutMs ?? step.timeoutMs,
      };
    }
  }

  return {
    ...(config.enabled === undefined ? {} : { enabled: config.enabled }),
    ...(config.reason === undefined ? {} : { reason: config.reason }),
    ...(config.tags === undefined ? {} : { tags: config.tags }),
    ...(config.needs === undefined ? {} : { needs: config.needs }),
    ...(command === undefined ? {} : { command }),
    ...(config.requires === undefined ? {} : { requires: config.requires }),
    ...(config.writes === undefined ? {} : { writes: config.writes }),
    ...(config.invalidates === undefined ? {} : { invalidates: config.invalidates }),
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    ...(config.onFailure === undefined ? {} : { onFailure: config.onFailure }),
    ...(config.outputMeansFailure === undefined
      ? {}
      : { outputMeansFailure: config.outputMeansFailure }),
    ...(config.envFail === undefined ? {} : { envFail: config.envFail }),
  };
}

/** @purpose Apply one normalized layer and update leaf provenance and explicit waivers. */
function applyLayer(
  presets: Map<string, VerifyPreset>,
  layer: OverlayLayer,
  provenance: Map<string, string>,
  waivers: Map<string, VerifyStepWaiver>,
  policies: Map<string, VerifyPluginPolicy>
): void {
  for (const plugin of Object.keys(layer.config.presets).sort(compareText)) {
    const preset = presets.get(plugin);
    const pluginConfig = layer.config.presets[plugin];
    if (preset === undefined || pluginConfig === undefined) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_UNKNOWN_PLUGIN',
        `verify.presets.${plugin}`,
        `overlay references unknown plugin "${plugin}"`,
        `compose only detected/built-in presets; custom presets arrive in UV-22`,
        layerSource(layer, `verify.presets.${plugin}`)
      );
    }

    if (pluginConfig.phases !== undefined) {
      const phases = { ...preset.phases };
      for (const selectorId of Object.keys(pluginConfig.phases).sort(compareText)) {
        const selector = pluginConfig.phases[selectorId]!;
        phases[selectorId] = {
          include: [...selector.include],
          ...(selector.exclude === undefined ? {} : { exclude: [...selector.exclude] }),
        };
        const selectorPath = `verify.presets.${plugin}.phases.${selectorId}`;
        provenance.set(`${selectorPath}.include`, layerSource(layer, `${selectorPath}.include`));
        if (selector.exclude !== undefined) {
          provenance.set(`${selectorPath}.exclude`, layerSource(layer, `${selectorPath}.exclude`));
        }
      }
      presets.set(plugin, { ...preset, phases });
    }

    if (pluginConfig.blocking !== undefined) {
      const blockingPath = `verify.presets.${plugin}.blocking`;
      const reasonPath = `verify.presets.${plugin}.reason`;
      const source = layerSource(layer, blockingPath);
      const reasonSource =
        pluginConfig.reason === undefined ? undefined : layerSource(layer, reasonPath);
      policies.set(plugin, {
        plugin,
        blocking: pluginConfig.blocking,
        ...(pluginConfig.reason === undefined ? {} : { reason: pluginConfig.reason }),
        source,
        ...(reasonSource === undefined ? {} : { reasonSource }),
      });
      provenance.set(blockingPath, source);
      if (reasonSource !== undefined) provenance.set(reasonPath, reasonSource);
      else provenance.delete(reasonPath);
    }

    const currentPreset = presets.get(plugin)!;
    const steps = new Map(currentPreset.steps.map((step) => [step.id, step]));
    for (const stepId of Object.keys(pluginConfig.steps).sort(compareText)) {
      const step = steps.get(stepId);
      const config = pluginConfig.steps[stepId];
      const keyPath = `verify.presets.${plugin}.steps.${stepId}`;
      if (config === undefined) continue;
      if (step === undefined) {
        const custom = materializeCustomStep(plugin, stepId, config, keyPath, layer);
        steps.set(stepId, custom);
        recordLeafProvenance(custom, keyPath, layerSource(layer, keyPath), provenance);
        if (config.enabled === false) {
          const source = layerSource(layer, `${keyPath}.enabled`);
          waivers.set(`${plugin}:${stepId}`, {
            stepId: `${plugin}:${stepId}`,
            reason: config.reason!,
            source,
          });
        }
        continue;
      }
      const override = materializeOverride(step, config, keyPath, layer);
      const qualifiedId = `${plugin}:${stepId}` as const;
      if (override.enabled === false) {
        const source = layerSource(layer, `${keyPath}.enabled`);
        waivers.set(qualifiedId, { stepId: qualifiedId, reason: override.reason!, source });
      } else if (override.enabled === true) {
        waivers.delete(qualifiedId);
      }

      const next: VerifyStep = {
        ...step,
        ...(override.tags === undefined ? {} : { tags: override.tags }),
        ...(override.needs === undefined ? {} : { needs: override.needs }),
        ...(override.command === undefined ? {} : { command: override.command }),
        ...(override.requires === undefined ? {} : { requires: override.requires }),
        ...(override.writes === undefined ? {} : { writes: override.writes }),
        ...(override.invalidates === undefined ? {} : { invalidates: override.invalidates }),
        ...(override.timeoutMs === undefined ? {} : { timeoutMs: override.timeoutMs }),
        ...(override.onFailure === undefined ? {} : { onFailure: override.onFailure }),
        ...(override.outputMeansFailure === undefined
          ? {}
          : { outputMeansFailure: override.outputMeansFailure }),
        ...(override.envFail === undefined ? {} : { envFail: override.envFail }),
      };
      steps.set(stepId, next);

      for (const field of [
        'enabled',
        'reason',
        'tags',
        'needs',
        'requires',
        'invalidates',
        'timeoutMs',
        'onFailure',
        'outputMeansFailure',
        'envFail',
      ] as const) {
        if (override[field] === undefined) continue;
        provenance.set(
          `${keyPath}.${field}`,
          layerSource(layer, `${keyPath}.${field}`, field === 'timeoutMs' ? 'timeout' : field)
        );
      }
      if (override.writes !== undefined) {
        for (const field of ['root', 'include', 'exclude'] as const) {
          if (override.writes[field] === undefined) continue;
          provenance.set(
            `${keyPath}.writes.${field}`,
            layerSource(layer, `${keyPath}.writes.${field}`)
          );
        }
      }
      if (override.command !== undefined) {
        for (const field of ['argv', 'cwd'] as const) {
          if (config.command?.[field] === undefined) continue;
          provenance.set(
            `${keyPath}.command.${field}`,
            layerSource(layer, `${keyPath}.command.${field}`)
          );
        }
        if (config.timeoutMs !== undefined) {
          provenance.set(
            `${keyPath}.command.timeoutMs`,
            layerSource(layer, `${keyPath}.command.timeoutMs`, 'timeout')
          );
        }
        for (const key of Object.keys(config.command?.env ?? {}).sort(compareText)) {
          provenance.set(
            `${keyPath}.command.env.${key}`,
            layerSource(layer, `${keyPath}.command.env.${key}`)
          );
        }
      }
    }
    presets.set(plugin, {
      ...currentPreset,
      steps: [...steps.values()].sort((left, right) => compareText(left.id, right.id)),
    });
  }
}

/**
 * @purpose Compose builtins, detected facts, legacy translation and target files in fixed precedence.
 * @param input Explicitly ranked composition inputs.
 * @returns Concrete presets with per-key provenance, waivers and migration diagnostics.
 */
export function composePresets(input: ComposeVerifyPresetsInput): ComposedVerifyPresets {
  const presets = new Map(
    [...input.presets]
      .sort((left, right) => compareText(left.plugin, right.plugin))
      .map((preset) => [preset.plugin, clonePreset(preset)])
  );
  const provenance = new Map<string, string>();
  const policies = new Map<string, VerifyPluginPolicy>();
  const sddMapping = new Map<string, string>();
  const sddMappingSources = new Map<string, string[]>();
  const sddMappingConflicts = new Map<string, Set<string>>();
  for (const preset of presets.values()) {
    recordLeafProvenance(
      preset,
      `verify.presets.${preset.plugin}`,
      `builtin:${preset.plugin}`,
      provenance
    );
    policies.set(preset.plugin, {
      plugin: preset.plugin,
      blocking: true,
      source: `builtin:${preset.plugin}`,
    });
    for (const [kind, selector] of Object.entries(preset.sddKinds).sort(([left], [right]) =>
      compareText(left, right)
    )) {
      const existing = sddMapping.get(kind);
      if (existing !== undefined && existing !== selector) {
        const conflict = sddMappingConflicts.get(kind) ?? new Set([existing]);
        conflict.add(selector);
        sddMappingConflicts.set(kind, conflict);
      }
      sddMapping.set(kind, selector);
      const sources = sddMappingSources.get(kind) ?? [];
      sources.push(`builtin:${preset.plugin}`);
      sddMappingSources.set(kind, sources);
    }
  }
  const sddMappingProvenance = new Map(
    [...sddMappingSources].map(([kind, sources]) => [kind, sources.sort(compareText).join('+')])
  );

  const layers: OverlayLayer[] = [];
  for (const detected of [...(input.detected ?? [])].sort((left, right) =>
    compareText(left.source, right.source)
  )) {
    layers.push({
      config: detected.config,
      defaultSource: `detected:${detected.source}`,
      provenance: detected.provenance ?? new Map(),
    });
  }
  if (input.legacy !== undefined) {
    if (input.legacy.errors.length > 0 || input.legacy.config === null) {
      if (input.legacy.errors[0] !== undefined) throw input.legacy.errors[0];
    } else {
      layers.push({
        config: input.legacy.config,
        defaultSource: 'legacy:stack',
        provenance: input.legacy.provenance,
      });
    }
  }
  if (input.files !== undefined) {
    if (input.files.errors.length > 0) throw input.files.errors[0]!;
    if (input.files.config !== null) {
      layers.push({
        config: input.files.config,
        defaultSource: input.files.sources[0] ?? 'verify config',
        provenance: input.files.provenance,
      });
    }
  }

  const waivers = new Map<string, VerifyStepWaiver>();
  for (const layer of layers) {
    applyLayer(presets, layer, provenance, waivers, policies);
    for (const [kind, selector] of Object.entries(layer.config.sdd?.mapping ?? {}).sort(
      ([left], [right]) => compareText(left, right)
    )) {
      const path = `verify.sdd.mapping.${kind}`;
      sddMapping.set(kind, selector);
      sddMappingConflicts.delete(kind);
      sddMappingProvenance.set(kind, layerSource(layer, path));
      provenance.set(path, layerSource(layer, path));
    }
  }

  const unresolvedConflict = [...sddMappingConflicts].sort(([left], [right]) =>
    compareText(left, right)
  )[0];
  if (unresolvedConflict !== undefined) {
    const [kind, selectors] = unresolvedConflict;
    throw new VerifyConfigError(
      'VERIFY_CONFIG_CONFLICTING_SDD_DEFAULT',
      `verify.sdd.mapping.${kind}`,
      `built-in presets disagree: ${[...selectors].sort(compareText).join(', ')}`,
      `set verify.sdd.mapping.${kind} to one selector declared by every participating preset`
    );
  }

  const composedPresets = [...presets.values()];
  try {
    validatePlan(composedPresets);
  } catch (error) {
    if (!(error instanceof VerifyPlanError)) throw error;
    throw new VerifyConfigError(
      error.code === 'VERIFY_PLAN_MISSING_DEPENDENCY' ||
        error.code === 'VERIFY_PLAN_MISSING_INVALIDATION_TARGET'
        ? 'VERIFY_CONFIG_INVALID_REFERENCE'
        : 'VERIFY_CONFIG_INVALID_PLAN',
      'verify.presets',
      error.message,
      'fix the referenced override before any plan is selected'
    );
  }

  return {
    presets: composedPresets,
    provenance,
    waivers: [...waivers.values()].sort((left, right) => compareText(left.stepId, right.stepId)),
    migrationDiagnostics: [...(input.legacy?.diagnostics ?? [])],
    policies: [...policies.values()].sort((left, right) => compareText(left.plugin, right.plugin)),
    sddMapping: Object.fromEntries(
      [...sddMapping].sort(([left], [right]) => compareText(left, right))
    ),
    sddMappingProvenance,
  };
}

/**
 * @purpose Resolve one open workflow kind only after default and project mapping composition.
 * @param composed Fully overlaid presets and mapping provenance.
 * @param kind Exact open-vocabulary SDD workflow kind.
 * @param [participatingPlugins] Scope-selected plugins that must declare the resolved selector.
 * @returns Resolved kind, selector and its winning configuration source.
 */
export function resolveSddVerifySelector(
  composed: ComposedVerifyPresets,
  kind: string,
  participatingPlugins: readonly PluginId[] = composed.presets.map((preset) => preset.plugin)
): { readonly kind: string; readonly selector: string; readonly source: string } {
  const selector = composed.sddMapping[kind];
  const path = `verify.sdd.mapping.${kind}`;
  if (selector === undefined) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNRESOLVED_SDD_KIND',
      path,
      `workflow kind "${kind}" remains unresolved after built-in defaults and project overrides`,
      `set ${path}: <declared-selector>`
    );
  }
  const participating = new Set(participatingPlugins);
  const missing = composed.presets
    .filter((preset) => participating.has(preset.plugin))
    .filter((preset) => preset.phases[selector] === undefined)
    .map((preset) => preset.plugin)
    .sort(compareText);
  const source = composed.sddMappingProvenance.get(kind) ?? 'unknown';
  if (missing.length > 0) {
    throw new VerifyConfigError(
      'VERIFY_CONFIG_UNKNOWN_SELECTOR',
      path,
      `selector "${selector}" from ${source} is undeclared for preset(s): ${missing.join(', ')}`,
      `declare verify.presets.<plugin>.phases.${selector} for every participating preset or override ${path}`,
      source
    );
  }
  return { kind, selector, source };
}
