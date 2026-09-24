// @file: Strict loader for the target top-level verify config overlay.
// @consumers: verify preset composition and future verify CLI
// @spec: CLI-VERIFY

import path from 'node:path';
import {
  isPlainObject,
  loadConfigSection,
  parseDuration,
  provenanceOf,
} from '../../../services/config/config-loader.ts';
import type { VerifyPreset } from '../model/verify-preset.type.ts';
import type { LocalCommand, Requirement, WriteBoundary } from '../model/verify-step.type.ts';
import { VerifyConfigError } from './verify-config.error.ts';
import type {
  VerifyCommandConfig,
  VerifyConfig,
  VerifyConfigLoad,
  VerifyPluginConfig,
  VerifyStepConfig,
} from './verify-config.type.ts';

const TOP_LEVEL_KEYS = ['presets'] as const;
const PLUGIN_KEYS = ['steps'] as const;
const STEP_KEYS = [
  'enabled',
  'reason',
  'tags',
  'needs',
  'command',
  'requires',
  'writes',
  'invalidates',
  'timeout',
  'onFailure',
] as const;
const COMMAND_KEYS = ['npmScript', 'argv', 'cwd', 'env'] as const;
const REQUIREMENT_KEYS = ['id', 'kind', 'description', 'required', 'fix', 'probe'] as const;
const PROBE_KEYS = ['argv', 'cwd', 'env', 'timeout'] as const;
const WRITE_KEYS = ['root', 'include', 'exclude'] as const;
const REQUIREMENT_KINDS = ['command', 'script', 'file', 'config', 'credential', 'runtime'] as const;
const FAILURE_POLICIES = ['stop-phase', 'block-dependents', 'continue'] as const;

/** @purpose Compare strings by locale-independent UTF-16 code-unit order. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @purpose Resolve a full config path to its winning file source. */
function sourceAt(provenance: ReadonlyMap<string, string>, fullPath: string): string | null {
  return provenanceOf(provenance, fullPath.replace(/^verify\./, ''));
}

/** @purpose Resolve an authored repo-relative path without permitting escape from the repository. */
function repoRelativePath(
  root: string,
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be a non-empty repo-relative path',
        'use "." for the repository root',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }

  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, value);
  const relative = path.relative(normalizedRoot, resolved);
  if (
    path.isAbsolute(value) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `path "${value}" escapes the repository root`,
        'use a relative path contained by the repository root',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  return resolved;
}

/** @purpose Record unknown object keys with exact source and known-key guidance. */
function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): void {
  for (const key of Object.keys(value).sort()) {
    if (allowed.includes(key)) continue;
    const pathName = `${keyPath}.${key}`;
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_UNKNOWN_FIELD',
        pathName,
        `unknown field "${key}"`,
        `use one of: ${allowed.join(', ')}`,
        sourceAt(provenance, pathName)
      )
    );
  }
}

/** @purpose Validate and copy an array of non-empty strings. */
function stringArray(
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)
  ) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be an array of non-empty strings',
        'replace the value with a YAML/JSON string array',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  return [...value] as readonly string[];
}

/** @purpose Validate a string-to-string environment map. */
function environment(
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): Readonly<Record<string, string>> | undefined {
  if (!isPlainObject(value) || Object.values(value).some((entry) => typeof entry !== 'string')) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be a map of string values',
        'quote every environment value explicitly',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => compareText(left, right))
  ) as Readonly<Record<string, string>>;
}

/** @purpose Validate a partial command override over a concrete preset command. */
function commandConfig(
  root: string,
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): VerifyCommandConfig | undefined {
  if (!isPlainObject(value)) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be an object',
        'declare command.argv, command.cwd or command.env',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  rejectUnknownKeys(value, COMMAND_KEYS, keyPath, provenance, errors);
  const command: {
    npmScript?: string;
    argv?: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  } = {};
  if (value['npmScript'] !== undefined) {
    if (typeof value['npmScript'] !== 'string' || value['npmScript'].trim().length === 0) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${keyPath}.npmScript`,
          'must be a non-empty script name',
          'name the package.json script that the Node plugin should resolve in UV-04',
          sourceAt(provenance, `${keyPath}.npmScript`)
        )
      );
    } else {
      command.npmScript = value['npmScript'];
    }
  }
  if (value['argv'] !== undefined) {
    const argv = stringArray(value['argv'], `${keyPath}.argv`, provenance, errors);
    if (argv !== undefined && argv.length === 0) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${keyPath}.argv`,
          'must not be empty',
          'provide an executable followed by its arguments',
          sourceAt(provenance, `${keyPath}.argv`)
        )
      );
    } else if (argv !== undefined) {
      command.argv = argv;
    }
  }
  if (value['cwd'] !== undefined) {
    const cwd = repoRelativePath(root, value['cwd'], `${keyPath}.cwd`, provenance, errors);
    if (cwd !== undefined) command.cwd = cwd;
  }
  if (value['env'] !== undefined) {
    const env = environment(value['env'], `${keyPath}.env`, provenance, errors);
    if (env !== undefined) command.env = env;
  }
  return command;
}

/** @purpose Validate one full non-mutating readiness probe. */
function probeCommand(
  root: string,
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): LocalCommand | undefined {
  if (!isPlainObject(value)) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be an object',
        'declare argv, cwd and timeout for the probe',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  rejectUnknownKeys(value, PROBE_KEYS, keyPath, provenance, errors);
  const argv = stringArray(value['argv'], `${keyPath}.argv`, provenance, errors);
  const cwd = repoRelativePath(root, value['cwd'], `${keyPath}.cwd`, provenance, errors);
  const timeout = value['timeout'];
  const timeoutMs = typeof timeout === 'string' ? parseDuration(timeout) : null;
  if (argv !== undefined && argv.length === 0) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        `${keyPath}.argv`,
        'must not be empty',
        'provide the probe executable',
        sourceAt(provenance, `${keyPath}.argv`)
      )
    );
  }
  if (timeoutMs === null) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_DURATION',
        `${keyPath}.timeout`,
        'must be a positive duration such as "90s", "5m" or "1h"',
        'use the <positive-int><s|m|h> grammar',
        sourceAt(provenance, `${keyPath}.timeout`)
      )
    );
  }
  const env =
    value['env'] === undefined
      ? undefined
      : environment(value['env'], `${keyPath}.env`, provenance, errors);
  if (argv === undefined || argv.length === 0 || cwd === undefined || timeoutMs === null) {
    return undefined;
  }
  return { argv, cwd, ...(env === undefined ? {} : { env }), timeoutMs };
}

/** @purpose Validate one readiness requirement replacement entry. */
function requirement(
  root: string,
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): Requirement | undefined {
  if (!isPlainObject(value)) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be an object',
        'declare id, kind, description, required and fix',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  rejectUnknownKeys(value, REQUIREMENT_KEYS, keyPath, provenance, errors);
  const stringKeys = ['id', 'description', 'fix'] as const;
  for (const key of stringKeys) {
    if (typeof value[key] !== 'string' || value[key].trim().length === 0) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${keyPath}.${key}`,
          'must be a non-empty string',
          `provide requirement.${key}`,
          sourceAt(provenance, `${keyPath}.${key}`)
        )
      );
    }
  }
  if (!(REQUIREMENT_KINDS as readonly unknown[]).includes(value['kind'])) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        `${keyPath}.kind`,
        `must be one of: ${REQUIREMENT_KINDS.join(', ')}`,
        'select the capability class that readiness should report',
        sourceAt(provenance, `${keyPath}.kind`)
      )
    );
  }
  if (typeof value['required'] !== 'boolean') {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        `${keyPath}.required`,
        'must be a boolean',
        'use true for blocking capability absence or false for degradation',
        sourceAt(provenance, `${keyPath}.required`)
      )
    );
  }
  const probe =
    value['probe'] === undefined
      ? undefined
      : probeCommand(root, value['probe'], `${keyPath}.probe`, provenance, errors);
  if (
    typeof value['id'] !== 'string' ||
    typeof value['description'] !== 'string' ||
    typeof value['fix'] !== 'string' ||
    !(REQUIREMENT_KINDS as readonly unknown[]).includes(value['kind']) ||
    typeof value['required'] !== 'boolean'
  ) {
    return undefined;
  }
  return {
    id: value['id'],
    kind: value['kind'] as Requirement['kind'],
    description: value['description'],
    required: value['required'],
    fix: value['fix'],
    ...(probe === undefined ? {} : { probe }),
  };
}

/** @purpose Validate one replacement write boundary. */
function writeBoundary(
  root: string,
  value: unknown,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): WriteBoundary | undefined {
  if (!isPlainObject(value)) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be an object',
        'declare root and include globs',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  rejectUnknownKeys(value, WRITE_KEYS, keyPath, provenance, errors);
  const rootValue = repoRelativePath(root, value['root'], `${keyPath}.root`, provenance, errors);
  const include = stringArray(value['include'], `${keyPath}.include`, provenance, errors);
  const exclude =
    value['exclude'] === undefined
      ? undefined
      : stringArray(value['exclude'], `${keyPath}.exclude`, provenance, errors);
  if (rootValue === undefined || include === undefined) return undefined;
  return {
    root: rootValue,
    include,
    ...(exclude === undefined ? {} : { exclude }),
  };
}

/** @purpose Validate references against the known built-in preset ids. */
function validateReferences(
  plugin: string,
  references: readonly string[],
  knownStepIds: ReadonlySet<string>,
  keyPath: string,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): void {
  for (const reference of references) {
    const parts = reference.split(':');
    const qualified = parts.length === 1 ? `${plugin}:${reference}` : reference;
    if (
      parts.length > 2 ||
      parts.some((part) => part.trim().length === 0) ||
      !knownStepIds.has(qualified)
    ) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_REFERENCE',
          keyPath,
          `unknown or malformed step reference "${reference}"`,
          `reference an existing local id or qualified <plugin>:<local-id>; known: ${[...knownStepIds].sort().join(', ')}`,
          sourceAt(provenance, keyPath)
        )
      );
    }
  }
}

/** @purpose Validate and normalize one existing-step override. */
function stepConfig(
  root: string,
  plugin: string,
  value: unknown,
  keyPath: string,
  knownStepIds: ReadonlySet<string>,
  provenance: ReadonlyMap<string, string>,
  errors: VerifyConfigError[]
): VerifyStepConfig | undefined {
  if (!isPlainObject(value)) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        'must be an object',
        'declare only fields that override the built-in step',
        sourceAt(provenance, keyPath)
      )
    );
    return undefined;
  }
  rejectUnknownKeys(value, STEP_KEYS, keyPath, provenance, errors);
  const result: {
    enabled?: boolean;
    reason?: string;
    tags?: readonly string[];
    needs?: readonly string[];
    command?: VerifyCommandConfig;
    requires?: readonly Requirement[];
    writes?: WriteBoundary;
    invalidates?: readonly string[];
    timeoutMs?: number;
    onFailure?: VerifyStepConfig['onFailure'];
  } = {};

  if (value['enabled'] !== undefined) {
    if (typeof value['enabled'] !== 'boolean') {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${keyPath}.enabled`,
          'must be a boolean',
          'use false with a non-empty reason to waive the step',
          sourceAt(provenance, `${keyPath}.enabled`)
        )
      );
    } else {
      result.enabled = value['enabled'];
    }
  }
  if (value['reason'] !== undefined) {
    if (typeof value['reason'] !== 'string' || value['reason'].trim().length === 0) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_DISABLE_REASON_REQUIRED',
          `${keyPath}.reason`,
          'must be a non-empty string',
          'explain why this step is explicitly disabled',
          sourceAt(provenance, `${keyPath}.reason`)
        )
      );
    } else {
      result.reason = value['reason'];
    }
  }
  if (value['enabled'] === false && result.reason === undefined) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_DISABLE_REASON_REQUIRED',
        `${keyPath}.reason`,
        'explicit disable requires a non-empty reason',
        'add reason: <why this verification is waived>',
        sourceAt(provenance, `${keyPath}.enabled`)
      )
    );
  }
  for (const field of ['tags', 'needs', 'invalidates'] as const) {
    if (value[field] === undefined) continue;
    const parsed = stringArray(value[field], `${keyPath}.${field}`, provenance, errors);
    if (parsed !== undefined) {
      result[field] = parsed;
      if (field !== 'tags') {
        validateReferences(plugin, parsed, knownStepIds, `${keyPath}.${field}`, provenance, errors);
      }
    }
  }
  if (value['command'] !== undefined) {
    const command = commandConfig(root, value['command'], `${keyPath}.command`, provenance, errors);
    if (command?.npmScript !== undefined && plugin !== 'node') {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED',
          `${keyPath}.command.npmScript`,
          'npmScript is owned by the Node preset',
          'use generic command.argv for this plugin',
          sourceAt(provenance, `${keyPath}.command.npmScript`)
        )
      );
    } else if (command !== undefined) {
      result.command = command;
    }
  }
  if (value['requires'] !== undefined) {
    if (!Array.isArray(value['requires'])) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${keyPath}.requires`,
          'must be an array of requirement objects',
          'replace the whole requirement list with valid entries',
          sourceAt(provenance, `${keyPath}.requires`)
        )
      );
    } else {
      const requirements = value['requires'].map((entry, index) =>
        requirement(root, entry, `${keyPath}.requires[${index}]`, provenance, errors)
      );
      if (requirements.every((entry) => entry !== undefined)) {
        result.requires = requirements as readonly Requirement[];
      }
    }
  }
  if (value['writes'] !== undefined) {
    const writes = writeBoundary(root, value['writes'], `${keyPath}.writes`, provenance, errors);
    if (writes !== undefined) result.writes = writes;
  }
  if (value['timeout'] !== undefined) {
    const timeoutMs = typeof value['timeout'] === 'string' ? parseDuration(value['timeout']) : null;
    if (timeoutMs === null) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_DURATION',
          `${keyPath}.timeout`,
          'must be a positive duration such as "90s", "5m" or "1h"',
          'use the <positive-int><s|m|h> grammar',
          sourceAt(provenance, `${keyPath}.timeout`)
        )
      );
    } else {
      result.timeoutMs = timeoutMs;
    }
  }
  if (value['onFailure'] !== undefined) {
    if (!(FAILURE_POLICIES as readonly unknown[]).includes(value['onFailure'])) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${keyPath}.onFailure`,
          `must be one of: ${FAILURE_POLICIES.join(', ')}`,
          'select an explicit planner failure policy',
          sourceAt(provenance, `${keyPath}.onFailure`)
        )
      );
    } else {
      result.onFailure = value['onFailure'] as VerifyStepConfig['onFailure'];
    }
  }
  return result;
}

/**
 * @purpose Load and strictly validate the target top-level `verify:` config with personal-highest priority.
 * @param root Absolute repository root.
 * @param presets Concrete known presets whose plugin and step ids form the closed UV-03 vocabulary.
 * @param [homeDirectory] Explicit personal-config directory; defaults to process HOME.
 * @returns All-or-nothing normalized config, file provenance and typed fatal errors.
 * @sideEffect IO: reads project and personal configuration files.
 */
export function loadVerifyConfig(
  root: string,
  presets: readonly VerifyPreset[],
  homeDirectory?: string
): VerifyConfigLoad {
  const loaded = loadConfigSection(root, 'verify', {
    personalPriority: 'highest',
    ...(homeDirectory === undefined ? {} : { homeDirectory }),
  });
  const errors = loaded.errors.map(
    (error) =>
      new VerifyConfigError(
        'VERIFY_CONFIG_PARSE',
        error.path,
        error.message,
        'fix the source file before composing any verify preset'
      )
  );
  if (loaded.section === null) {
    return { config: null, errors, sources: loaded.sources, provenance: loaded.provenance };
  }

  rejectUnknownKeys(loaded.section, TOP_LEVEL_KEYS, 'verify', loaded.provenance, errors);
  const rawPresets = loaded.section['presets'];
  if (rawPresets === undefined) {
    return {
      config: errors.length === 0 ? { presets: {} } : null,
      errors,
      sources: loaded.sources,
      provenance: loaded.provenance,
    };
  }
  if (!isPlainObject(rawPresets)) {
    errors.push(
      new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets',
        'must be a map keyed by plugin id',
        'nest step overrides under verify.presets.<plugin>.steps',
        sourceAt(loaded.provenance, 'verify.presets')
      )
    );
    return { config: null, errors, sources: loaded.sources, provenance: loaded.provenance };
  }

  const knownPresets = new Map(presets.map((preset) => [preset.plugin, preset]));
  const knownStepIds = new Set(
    presets.flatMap((preset) => preset.steps.map((step) => `${preset.plugin}:${step.id}`))
  );
  const normalized: Record<string, VerifyPluginConfig> = {};
  for (const plugin of Object.keys(rawPresets).sort()) {
    const pluginPath = `verify.presets.${plugin}`;
    const rawPlugin = rawPresets[plugin];
    const preset = knownPresets.get(plugin);
    if (preset === undefined) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_UNKNOWN_PLUGIN',
          pluginPath,
          `unknown plugin "${plugin}"`,
          `known detected/built-in plugins: ${[...knownPresets.keys()].sort().join(', ') || 'none'}; custom presets arrive in UV-22`,
          sourceAt(loaded.provenance, pluginPath)
        )
      );
      continue;
    }
    if (!isPlainObject(rawPlugin)) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          pluginPath,
          'must be an object',
          `declare ${pluginPath}.steps`,
          sourceAt(loaded.provenance, pluginPath)
        )
      );
      continue;
    }
    rejectUnknownKeys(rawPlugin, PLUGIN_KEYS, pluginPath, loaded.provenance, errors);
    const rawSteps = rawPlugin['steps'];
    if (rawSteps !== undefined && !isPlainObject(rawSteps)) {
      errors.push(
        new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          `${pluginPath}.steps`,
          'must be a map keyed by existing local step id',
          'custom steps arrive in UV-22; override an existing preset step here',
          sourceAt(loaded.provenance, `${pluginPath}.steps`)
        )
      );
      continue;
    }
    const knownLocalSteps = new Set(preset.steps.map((step) => step.id));
    const steps: Record<string, VerifyStepConfig> = {};
    for (const stepId of Object.keys(rawSteps ?? {}).sort()) {
      const stepPath = `${pluginPath}.steps.${stepId}`;
      if (!knownLocalSteps.has(stepId)) {
        errors.push(
          new VerifyConfigError(
            'VERIFY_CONFIG_UNKNOWN_STEP',
            stepPath,
            `unknown step "${stepId}" for plugin "${plugin}"`,
            `known steps: ${[...knownLocalSteps].sort().join(', ') || 'none'}; custom steps arrive in UV-22`,
            sourceAt(loaded.provenance, stepPath)
          )
        );
        continue;
      }
      const parsed = stepConfig(
        root,
        plugin,
        (rawSteps as Record<string, unknown>)[stepId],
        stepPath,
        knownStepIds,
        loaded.provenance,
        errors
      );
      if (parsed !== undefined) steps[stepId] = parsed;
    }
    normalized[plugin] = { steps };
  }

  const config: VerifyConfig = { presets: normalized };
  return {
    config: errors.length === 0 ? config : null,
    errors,
    sources: loaded.sources,
    provenance: loaded.provenance,
  };
}
