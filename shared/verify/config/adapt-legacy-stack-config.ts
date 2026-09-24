// @file: Temporary lossless adapter from legacy stack pipeline fields to target verify overlays.
// @consumers: UV-04..06 compatibility composition and migration reporting
// @spec: CLI-VERIFY

import path from 'node:path';
import {
  isPlainObject,
  parseDuration,
  provenanceOf,
} from '../../../services/config/config-loader.ts';
import type { VerifyPreset } from '../model/verify-preset.type.ts';
import type { StackConfig, StackPluginConfig } from '../verify.types.ts';
import { VerifyConfigError } from './verify-config.error.ts';
import type {
  LegacyVerifyConfigAdapter,
  VerifyConfig,
  VerifyMigrationDiagnostic,
  VerifyPluginConfig,
  VerifyStepConfig,
} from './verify-config.type.ts';

const LOSSLESS_OVERRIDE_FIELDS = ['argv', 'cwd', 'env', 'timeout'] as const;

/** @purpose Compare strings by locale-independent UTF-16 code-unit order. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @purpose Resolve and label the winning legacy file for one stack key. */
function legacySource(provenance: ReadonlyMap<string, string>, keyPath: string): string {
  return provenanceOf(provenance, keyPath.replace(/^stack\./, '')) ?? 'stack config';
}

/** @purpose Add one target provenance entry attributed explicitly to its legacy origin. */
function attribute(
  target: Map<string, string>,
  targetPath: string,
  provenance: ReadonlyMap<string, string>,
  legacyPath: string
): string {
  const source = legacySource(provenance, legacyPath);
  target.set(targetPath, `legacy:${source}`);
  return source;
}

/**
 * @purpose Translate only losslessly representable legacy pipeline fields into a target overlay.
 * @param root Absolute repository root used to normalize legacy cwd values.
 * @param presets Concrete presets whose step ids are the migration vocabulary.
 * @param config Validated legacy stack config, or null when absent.
 * @param provenance Per-key provenance returned by the unchanged legacy loader.
 * @returns All-or-nothing target overlay, migration diagnostics and typed non-lossless errors.
 */
export function adaptLegacyStackConfig(
  root: string,
  presets: readonly VerifyPreset[],
  config: StackConfig | null,
  provenance: ReadonlyMap<string, string>
): LegacyVerifyConfigAdapter {
  const errors: VerifyConfigError[] = [];
  const diagnostics: VerifyMigrationDiagnostic[] = [];
  const targetProvenance = new Map<string, string>();
  const targetPresets: Record<string, VerifyPluginConfig> = {};
  if (config === null) {
    return {
      config: { presets: {} },
      provenance: targetProvenance,
      diagnostics,
      errors,
    };
  }

  const presetByPlugin = new Map(presets.map((preset) => [preset.plugin, preset]));
  for (const plugin of Object.keys(config)
    .filter((key) => key !== 'use')
    .sort(compareText)) {
    const preset = presetByPlugin.get(plugin);
    const rawPlugin = config[plugin];
    if (!isPlainObject(rawPlugin)) continue;
    const pluginConfig = rawPlugin as StackPluginConfig;
    const steps: Record<string, VerifyStepConfig> = {};

    const findStep = (stepId: string, legacyPath: string) => {
      const step = preset?.steps.find((candidate) => candidate.id === stepId);
      if (preset === undefined || step === undefined) {
        errors.push(
          new VerifyConfigError(
            preset === undefined ? 'VERIFY_CONFIG_UNKNOWN_PLUGIN' : 'VERIFY_CONFIG_UNKNOWN_STEP',
            legacyPath,
            `legacy field cannot match target step "${plugin}:${stepId}"`,
            `migrate after the owning preset exposes this exact id; known: ${
              preset?.steps
                .map((candidate) => candidate.id)
                .sort(compareText)
                .join(', ') ?? 'none'
            }`,
            legacySource(provenance, legacyPath)
          )
        );
      }
      return step;
    };

    for (const stepId of [...(pluginConfig.skipGates ?? [])].sort(compareText)) {
      const legacyPath = `stack.${plugin}.skipGates`;
      if (findStep(stepId, legacyPath) === undefined) continue;
      const targetPath = `verify.presets.${plugin}.steps.${stepId}`;
      const source = attribute(targetProvenance, `${targetPath}.enabled`, provenance, legacyPath);
      targetProvenance.set(`${targetPath}.reason`, `legacy:${source}`);
      steps[stepId] = {
        ...(steps[stepId] ?? {}),
        enabled: false,
        reason: `legacy skipGates from ${source}; migrate to ${targetPath}.enabled: false`,
      };
      diagnostics.push({
        path: legacyPath,
        source,
        targetPath: `${targetPath}.enabled`,
        message: `replace ${legacyPath} entry "${stepId}" with enabled: false and an explicit reason`,
      });
    }

    for (const stepId of Object.keys(pluginConfig.overrideGates ?? {}).sort(compareText)) {
      const legacyPath = `stack.${plugin}.overrideGates.${stepId}`;
      const step = findStep(stepId, legacyPath);
      const gate = pluginConfig.overrideGates?.[stepId];
      if (step === undefined || gate === undefined) continue;
      const unsupported = Object.keys(gate)
        .filter((field) => !(LOSSLESS_OVERRIDE_FIELDS as readonly string[]).includes(field))
        .sort(compareText);
      for (const field of unsupported) {
        errors.push(
          new VerifyConfigError(
            'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
            `${legacyPath}.${field}`,
            `legacy field "${field}" has no lossless UV-03 target representation`,
            `rewrite it explicitly in the owning preset; do not drop it during migration`,
            legacySource(provenance, `${legacyPath}.${field}`)
          )
        );
      }
      if (unsupported.length > 0) continue;

      const targetPath = `verify.presets.${plugin}.steps.${stepId}`;
      const command: {
        argv?: readonly string[];
        cwd?: string;
        env?: Readonly<Record<string, string>>;
      } = {};
      if (gate.argv !== undefined) command.argv = gate.argv;
      if (gate.cwd !== undefined) command.cwd = path.resolve(root, gate.cwd);
      if (gate.env !== undefined) command.env = gate.env;
      let timeoutMs: number | undefined;
      if (gate.timeout !== undefined) {
        timeoutMs = parseDuration(gate.timeout) ?? undefined;
        if (timeoutMs === undefined) {
          errors.push(
            new VerifyConfigError(
              'VERIFY_CONFIG_INVALID_DURATION',
              `${legacyPath}.timeout`,
              `legacy duration "${gate.timeout}" is invalid`,
              'use a positive <int><s|m|h> duration before migration',
              legacySource(provenance, `${legacyPath}.timeout`)
            )
          );
          continue;
        }
      }
      const hasCommand = Object.keys(command).length > 0;
      steps[stepId] = {
        ...(steps[stepId] ?? {}),
        ...(hasCommand ? { command } : {}),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      };
      for (const field of Object.keys(gate).sort(compareText)) {
        const targetField = field === 'timeout' ? 'timeoutMs' : `command.${field}`;
        const source = attribute(
          targetProvenance,
          `${targetPath}.${targetField}`,
          provenance,
          `${legacyPath}.${field}`
        );
        diagnostics.push({
          path: `${legacyPath}.${field}`,
          source,
          targetPath: `${targetPath}.${field === 'timeout' ? 'timeout' : `command.${field}`}`,
          message: `move this lossless override to the target verify section`,
        });
        if (field === 'env' && gate.env !== undefined) {
          for (const key of Object.keys(gate.env).sort(compareText)) {
            targetProvenance.set(`${targetPath}.command.env.${key}`, `legacy:${source}`);
          }
        }
      }
    }

    if ((pluginConfig.extraGates?.length ?? 0) > 0) {
      const legacyPath = `stack.${plugin}.extraGates`;
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
          legacyPath,
          'extraGates cannot be converted without inventing tags, dependencies, effect and failure policy',
          'keep the legacy runtime until declarative custom steps ship in UV-22, then migrate each gate explicitly',
          legacySource(provenance, legacyPath)
        )
      );
    }

    if (Object.keys(steps).length > 0) targetPresets[plugin] = { steps };
  }

  const translated: VerifyConfig = { presets: targetPresets };
  return {
    config: errors.length === 0 ? translated : null,
    provenance: targetProvenance,
    diagnostics,
    errors,
  };
}
