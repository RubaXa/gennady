// @file: Deterministic target verify config overlay over concrete plugin presets.
// @consumers: UV-04..06 preset adapters and future verify planning entry point
// @spec: CLI-VERIFY

import { provenanceOf } from '../../../services/config/config-loader.ts';
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
    requirements: preset.requirements.map((requirement) => ({ ...requirement })),
    rules: [...preset.rules],
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

    const steps = new Map(preset.steps.map((step) => [step.id, step]));
    for (const stepId of Object.keys(pluginConfig.steps).sort(compareText)) {
      const step = steps.get(stepId);
      const config = pluginConfig.steps[stepId];
      const keyPath = `verify.presets.${plugin}.steps.${stepId}`;
      if (step === undefined || config === undefined) {
        throw new VerifyConfigError(
          'VERIFY_CONFIG_UNKNOWN_STEP',
          keyPath,
          `overlay references unknown step "${plugin}:${stepId}"`,
          `override an existing preset step; custom steps arrive in UV-22`,
          layerSource(layer, keyPath)
        );
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
      ...preset,
      steps: preset.steps.map((step) => steps.get(step.id) ?? step),
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
  }

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
  for (const layer of layers) applyLayer(presets, layer, provenance, waivers, policies);

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
  };
}
