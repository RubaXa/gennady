// @file: The `stack` config section — its schema, strict validation and application to a gate plan.
// @consumers: verify.cmd, fix.cmd
// @tasks: TSK-95

import path from 'node:path';
import {
  isPlainObject,
  loadConfigSection,
  parseDuration,
  provenanceOf,
  unknownKeyError,
  type ConfigError,
} from '../config/config-loader.ts';
import { compileEnvFailRules } from './env-fail.ts';
import type {
  Cmd,
  Gate,
  GateSpec,
  StackConfig,
  StackId,
  StackPluginConfig,
} from './stack.types.ts';

/** Default timeout for a precondition: they are probes, so seconds, not minutes. */
const PRECONDITION_DEFAULT_TIMEOUT_MS = 30_000;

/** Default timeout for extraGates entries that do not state one. */
const EXTRA_GATE_DEFAULT_TIMEOUT_MS = 10 * 60_000;

/** Known keys of a per-plugin config section (config.spec §3.3). */
const PLUGIN_SECTION_KEYS = ['skipGates', 'overrideGates', 'extraGates', 'sandboxLinks'] as const;

/** Known keys of a GateSpec (config.spec §3.4). */
export const GATE_SPEC_KEYS = [
  'id',
  'argv',
  'cwd',
  'env',
  'timeout',
  'outputMeansFailure',
  'driftMeansFailure',
  'envFail',
  'requires',
  'fixer',
] as const;

/** The `stack` section reuses the config scope's error shape (config.spec §3). */
export type StackConfigError = ConfigError;

/**
 * @purpose Result of loading the stack config.
 * @consumer verify.cmd
 */
export type StackConfigLoad = {
  /** @purpose Merged `stack` section, or null when no source carries one. */
  readonly config: StackConfig | null;
  /** @purpose Validation/parse errors; non-empty means verify must not run (exit 4). */
  readonly errors: readonly ConfigError[];
  /** @purpose Basenames of the files that contributed, highest priority first. */
  readonly sources: readonly string[];
  /** @purpose Winner file per dotted key path (per-key provenance, config.spec §1.2). */
  readonly provenance: ReadonlyMap<string, string>;
};

// #region START_VALIDATION — strict: any unknown key, wrong type or bad value is fatal

/** Keys a CmdSpec may carry (config.spec §3.4) — one shape for gate, requires and fixer. */
const CMD_SPEC_KEYS = ['argv', 'cwd', 'env', 'timeout', 'hint'] as const;

/**
 * @purpose Build runtime commands from CmdSpec entries: cwd resolved, duration parsed.
 * @param specs Raw `requires` entries (already validated).
 * @param root Absolute repository root.
 * @param fallbackCwd Directory used when an entry states no cwd.
 * @returns Runtime commands in declaration order.
 */
function toCommands(
  specs: readonly Readonly<Record<string, unknown>>[] | undefined,
  root: string,
  fallbackCwd: string,
  // Probes get seconds; a fixer inherits its gate's timeout (30s would kill `make generate`).
  defaultTimeoutMs: number = PRECONDITION_DEFAULT_TIMEOUT_MS
): Cmd[] {
  return (specs ?? []).map((spec) => ({
    argv: spec['argv'] as readonly string[],
    cwd: typeof spec['cwd'] === 'string' ? path.resolve(root, spec['cwd']) : fallbackCwd,
    env: spec['env'] as Readonly<Record<string, string>> | undefined,
    timeoutMs:
      typeof spec['timeout'] === 'string'
        ? (parseDuration(spec['timeout']) ?? defaultTimeoutMs)
        : defaultTimeoutMs,
    hint: spec['hint'] as string | undefined,
  }));
}

/**
 * @purpose Validate one CmdSpec (a `requires` entry or a fixer) against the closed schema.
 * @param spec Raw value from config.
 * @param keyPath Dotted path of the entry.
 * @param errors Error accumulator (mutated).
 */
function validateCmdSpec(
  spec: unknown,
  keyPath: string,
  errors: ConfigError[],
  requireHint: boolean
): void {
  if (!isPlainObject(spec)) {
    errors.push({ path: keyPath, message: 'must be an object' });
    return;
  }
  for (const key of Object.keys(spec)) {
    if (!(CMD_SPEC_KEYS as readonly string[]).includes(key)) {
      errors.push(unknownKeyError(`${keyPath}.${key}`, CMD_SPEC_KEYS));
    }
  }
  const { argv, cwd, env, timeout, hint } = spec as Record<string, unknown>;
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    argv.some((entry) => typeof entry !== 'string')
  ) {
    errors.push({ path: `${keyPath}.argv`, message: 'required non-empty array of strings' });
  }
  if (cwd !== undefined && typeof cwd !== 'string') {
    errors.push({ path: `${keyPath}.cwd`, message: 'must be a string (relative to repo root)' });
  }
  if (
    env !== undefined &&
    (!isPlainObject(env) || Object.values(env).some((value) => typeof value !== 'string'))
  ) {
    errors.push({ path: `${keyPath}.env`, message: 'must be a map of string to string' });
  }
  if (timeout !== undefined && (typeof timeout !== 'string' || parseDuration(timeout) === null)) {
    errors.push({
      path: `${keyPath}.timeout`,
      message: 'must be a duration string: <int>(s|m|h), e.g. "90s", "5m"',
    });
  }
  if (requireHint && (typeof hint !== 'string' || hint.length === 0)) {
    errors.push({
      path: `${keyPath}.hint`,
      message:
        'required non-empty string — a precondition without remediation says no more than a timeout',
    });
  }
  if (!requireHint && hint !== undefined) {
    errors.push({
      path: `${keyPath}.hint`,
      message: 'only a `requires` precondition carries a hint',
    });
  }
}

/**
 * @purpose Validate one GateSpec object.
 * @param spec Raw value from config.
 * @param keyPath Dotted path of the spec.
 * @param requireIdArgv True for extraGates entries, where id and argv are mandatory.
 * @param errors Error accumulator (mutated).
 */
function validateGateSpec(
  spec: unknown,
  keyPath: string,
  requireIdArgv: boolean,
  errors: ConfigError[]
): void {
  if (!isPlainObject(spec)) {
    errors.push({ path: keyPath, message: 'must be an object' });
    return;
  }

  for (const key of Object.keys(spec)) {
    if (!(GATE_SPEC_KEYS as readonly string[]).includes(key)) {
      errors.push(unknownKeyError(`${keyPath}.${key}`, GATE_SPEC_KEYS));
    }
  }

  const {
    id,
    argv,
    cwd,
    env,
    timeout,
    outputMeansFailure,
    driftMeansFailure,
    envFail,
    requires,
    fixer,
  } = spec as GateSpec;
  if (requireIdArgv && (typeof id !== 'string' || id.length === 0)) {
    errors.push({ path: `${keyPath}.id`, message: 'required non-empty string' });
  }
  if (
    argv !== undefined &&
    (!Array.isArray(argv) || argv.length === 0 || argv.some((a) => typeof a !== 'string'))
  ) {
    errors.push({ path: `${keyPath}.argv`, message: 'must be a non-empty array of strings' });
  }
  if (requireIdArgv && argv === undefined) {
    errors.push({ path: `${keyPath}.argv`, message: 'required non-empty array of strings' });
  }
  if (cwd !== undefined && typeof cwd !== 'string') {
    errors.push({ path: `${keyPath}.cwd`, message: 'must be a string (relative to repo root)' });
  }
  if (
    env !== undefined &&
    (!isPlainObject(env) || Object.values(env).some((v) => typeof v !== 'string'))
  ) {
    errors.push({ path: `${keyPath}.env`, message: 'must be a map of string to string' });
  }
  if (timeout !== undefined && (typeof timeout !== 'string' || parseDuration(timeout) === null)) {
    errors.push({
      path: `${keyPath}.timeout`,
      message: 'must be a duration string: <int>(s|m|h), e.g. "90s", "5m"',
    });
  }
  if (outputMeansFailure !== undefined && typeof outputMeansFailure !== 'boolean') {
    errors.push({ path: `${keyPath}.outputMeansFailure`, message: 'must be a boolean' });
  }
  if (driftMeansFailure !== undefined && typeof driftMeansFailure !== 'boolean') {
    errors.push({ path: `${keyPath}.driftMeansFailure`, message: 'must be a boolean' });
  }
  if (requires !== undefined) {
    if (!Array.isArray(requires)) {
      errors.push({ path: `${keyPath}.requires`, message: 'must be an array of commands' });
    } else {
      requires.forEach((entry, index) =>
        validateCmdSpec(entry, `${keyPath}.requires[${index}]`, errors, true)
      );
    }
  }
  if (envFail !== undefined) {
    errors.push(...compileEnvFailRules(envFail, `${keyPath}.envFail`).errors);
  }
  if (fixer !== undefined) {
    validateCmdSpec(fixer, `${keyPath}.fixer`, errors, false);
  }
}

/**
 * @purpose Validate the merged stack section against the closed schema (config.spec §3, §4.1).
 * @param config Merged stack section.
 * @param builtinGateIds Built-in gate ids per plugin, used to check overrideGates/skipGates keys.
 * @returns All errors found; empty means the config is usable.
 */
export function validateStackConfig(
  config: StackConfig,
  builtinGateIds: Readonly<Record<StackId, readonly string[]>>
): ConfigError[] {
  const errors: ConfigError[] = [];
  const pluginIds = Object.keys(builtinGateIds);
  const topKeys = ['use', ...pluginIds];

  for (const [key, value] of Object.entries(config)) {
    if (key === 'use') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        errors.push({ path: 'stack.use', message: 'must be an array of plugin ids' });
        continue;
      }
      for (const id of value) {
        if (!pluginIds.includes(id)) {
          errors.push(unknownKeyError(`stack.use.${id}`, pluginIds));
        }
      }
      continue;
    }

    if (!pluginIds.includes(key)) {
      errors.push(unknownKeyError(`stack.${key}`, topKeys));
      continue;
    }

    if (!isPlainObject(value)) {
      errors.push({ path: `stack.${key}`, message: 'must be an object' });
      continue;
    }

    const gateIds = builtinGateIds[key as StackId]!;
    const section = value as StackPluginConfig;

    for (const sectionKey of Object.keys(value)) {
      if (!(PLUGIN_SECTION_KEYS as readonly string[]).includes(sectionKey)) {
        errors.push(unknownKeyError(`stack.${key}.${sectionKey}`, PLUGIN_SECTION_KEYS));
      }
    }

    const extraIds = (Array.isArray(section.extraGates) ? section.extraGates : [])
      .map((spec) => (isPlainObject(spec) ? (spec as GateSpec).id : undefined))
      .filter((id): id is string => typeof id === 'string');

    if (section.sandboxLinks !== undefined) {
      if (
        !Array.isArray(section.sandboxLinks) ||
        section.sandboxLinks.some((v) => typeof v !== 'string')
      ) {
        errors.push({
          path: `stack.${key}.sandboxLinks`,
          message: 'must be an array of repo-relative paths',
        });
      } else {
        for (const link of section.sandboxLinks) {
          // A link shares a real path, so one outside the repo hands a gate arbitrary disk.
          const normalized = path.normalize(link).replace(/[/\\]+$/, '');
          if (
            path.isAbsolute(link) ||
            link.split(/[/\\]/).includes('..') ||
            normalized === '.' ||
            normalized === '' ||
            link.trim().length === 0
          ) {
            errors.push({
              path: `stack.${key}.sandboxLinks.${link}`,
              message:
                'must be a repo-relative path inside the repository, and not the root itself ' +
                '(`.` in the drift pathspec makes every mutation invisible)',
            });
          } else if (link.includes('**')) {
            // `*` covers one segment; `**` would silently act like `*`, so it is rejected.
            errors.push({
              path: `stack.${key}.sandboxLinks.${link}`,
              message: 'recursive ** is not supported — use single-segment * wildcards (a/*/b)',
            });
          }
        }
      }
    }

    if (section.skipGates !== undefined) {
      if (
        !Array.isArray(section.skipGates) ||
        section.skipGates.some((v) => typeof v !== 'string')
      ) {
        errors.push({ path: `stack.${key}.skipGates`, message: 'must be an array of gate ids' });
      } else {
        for (const id of section.skipGates) {
          if (!gateIds.includes(id) && !extraIds.includes(id)) {
            errors.push(unknownKeyError(`stack.${key}.skipGates.${id}`, [...gateIds, ...extraIds]));
          }
        }
      }
    }

    if (section.overrideGates !== undefined) {
      if (!isPlainObject(section.overrideGates)) {
        errors.push({
          path: `stack.${key}.overrideGates`,
          message: 'must be a map of gate id to GateSpec',
        });
      } else {
        for (const [gateId, spec] of Object.entries(section.overrideGates)) {
          if (!gateIds.includes(gateId)) {
            errors.push(unknownKeyError(`stack.${key}.overrideGates.${gateId}`, gateIds));
            continue;
          }
          validateGateSpec(spec, `stack.${key}.overrideGates.${gateId}`, false, errors);
        }
      }
    }

    for (const listKey of ['extraGates'] as const) {
      const list = section[listKey];
      if (list === undefined) {
        continue;
      }
      if (!Array.isArray(list)) {
        errors.push({ path: `stack.${key}.${listKey}`, message: 'must be an array of gate specs' });
        continue;
      }
      list.forEach((spec, index) =>
        validateGateSpec(spec, `stack.${key}.${listKey}[${index}]`, true, errors)
      );
    }
  }

  return errors;
}
// #endregion END_VALIDATION

/**
 * @purpose Load, merge and validate the stack config from all sources (config.spec §1.2, §4.1).
 * @invariant Priority: repo .gennadyrc > gennady.yaml > HOME .gennadyrc; objects merge, leaves replace.
 * @param root Absolute repository root.
 * @param builtinGateIds Built-in gate ids per plugin, for strict validation.
 * @returns Merged config with provenance; any error in `errors` is fatal for verify.
 * @sideEffect IO: reads config files.
 */
export function loadStackConfig(
  root: string,
  builtinGateIds: Readonly<Record<StackId, readonly string[]>>
): StackConfigLoad {
  // Discovery, merge and provenance are the config scope's job; this function owns only
  // the `stack` section's schema (config.spec §3).
  const loaded = loadConfigSection(root, 'stack');
  if (loaded.section === null) {
    return {
      config: null,
      errors: loaded.errors,
      sources: loaded.sources,
      provenance: loaded.provenance,
    };
  }
  const config = loaded.section as StackConfig;
  return {
    config,
    errors: [...loaded.errors, ...validateStackConfig(config, builtinGateIds)],
    sources: loaded.sources,
    provenance: loaded.provenance,
  };
}

/**
 * @purpose Extract one plugin's config slice from the merged config.
 * @param config Merged stack config, or null.
 * @param pluginId Plugin to extract the slice for.
 * @returns The plugin's config object, or null when absent.
 */
export function pluginConfigOf(
  config: StackConfig | null,
  pluginId: StackId
): StackPluginConfig | null {
  const slice = config?.[pluginId];
  return isPlainObject(slice) ? (slice as StackPluginConfig) : null;
}

/**
 * @purpose Overrides naming a gate the plugin never planned — valid id, no effect.
 * @invariant Load-time validation knows only the id vocabulary; which gates exist is known
 *   after planning, so the silent-drop case is caught here.
 * @param gates Planned gates of one stack.
 * @param pluginConfig That stack's config slice, or null.
 * @param stack Stack id, for the error path.
 * @returns One error per override that matched nothing.
 */
export function unmatchedGateOverrides(
  gates: readonly Gate[],
  pluginConfig: StackPluginConfig | null,
  stack: StackId
): ConfigError[] {
  const overrides = pluginConfig?.overrideGates ?? {};
  const planned = new Set(gates.map((gate) => gate.id));

  return Object.keys(overrides)
    .filter((id) => !planned.has(id))
    .map((id) => ({
      path: `${stack}.overrideGates.${id}`,
      message:
        `no ${stack} gate "${id}" in this repository, so the override cannot take effect — ` +
        `planned gates: ${[...planned].join(', ') || 'none'}`,
    }));
}

/**
 * @purpose Apply a plugin's config slice to its planned gates per FR-STACK-05.
 * @invariant Order: overrideGates → skipGates → extraGates. Config-skipped gates stay visible
 *   as skip entries carrying their source file — never silently dropped.
 * @param gates Gate plan produced by the plugin.
 * @param pluginConfig The plugin's merged config slice, or null for a pass-through.
 * @param stack Plugin id, used to attribute extra gates and resolve provenance.
 * @param root Absolute repository root.
 * @param provenance Per-key provenance map from loadStackConfig.
 * @param [unskipIds] Gate ids named by `--only` — config skipGates does not apply to them.
 * @returns The effective gate list.
 */
export function applyStackConfig(
  gates: readonly Gate[],
  pluginConfig: StackPluginConfig | null,
  stack: StackId,
  root: string,
  provenance: ReadonlyMap<string, string>,
  unskipIds?: readonly string[]
): Gate[] {
  if (pluginConfig === null) {
    return [...gates];
  }

  const overrides = pluginConfig.overrideGates ?? {};
  const skip = new Set(pluginConfig.skipGates ?? []);
  for (const id of unskipIds ?? []) {
    skip.delete(id);
  }
  const skipSource = provenanceOf(provenance, `${stack}.skipGates`) ?? 'config';

  const effective: Gate[] = gates.map((gate) => {
    const override = overrides[gate.id];
    let result = gate;

    if (override !== undefined) {
      const source = provenanceOf(provenance, `${stack}.overrideGates.${gate.id}`) ?? 'config';
      const timeoutMs =
        override.timeout !== undefined ? parseDuration(override.timeout)! : gate.timeoutMs;
      result = {
        ...gate,
        argv: override.argv ?? gate.argv,
        cwd: override.cwd !== undefined ? path.resolve(root, override.cwd) : gate.cwd,
        env: override.env ?? gate.env,
        timeoutMs,
        outputMeansFailure: override.outputMeansFailure ?? gate.outputMeansFailure,
        driftMeansFailure: override.driftMeansFailure ?? gate.driftMeansFailure,
        // An argv override replaces the binary, so its exit-code convention no longer
        // applies: `make lint` returns 2 for any failed recipe, which an inherited
        // exitAbove(1) would report as ENV_FAIL on a GENUINE finding. Output predicates
        // (panic traces, blocked module proxy) stay — they describe the environment.
        // Config rules PREPEND: `find()` returns the first match and plugin predicates often
        // carry no hint, so appending would silently discard the author's remediation.
        requires:
          override.requires !== undefined
            ? toCommands(override.requires, root, gate.cwd)
            : gate.requires,
        fixer:
          override.fixer !== undefined
            ? toCommands([override.fixer], root, gate.cwd, timeoutMs)[0]
            : gate.fixer,
        envFail: [
          ...compileEnvFailRules(
            override.envFail ?? [],
            `${stack}.overrideGates.${gate.id}.envFail`,
            provenanceOf(provenance, `${stack}.overrideGates.${gate.id}.envFail`) ?? 'config'
          ).predicates,
          ...((override.argv !== undefined
            ? gate.envFail?.filter((predicate) => predicate.kind !== 'exit')
            : gate.envFail) ?? []),
        ],
        label: `${gate.label} (overridden by ${source})`,
        // An explicit argv override supersedes a planner skip: the config author
        // states the command is runnable in this repo.
        skipped: override.argv !== undefined ? null : gate.skipped,
      };
    }

    if (skip.has(gate.id)) {
      result = { ...result, argv: [], skipped: `skipGates (${skipSource})` };
    }
    return result;
  });

  const extraSource = provenanceOf(provenance, `${stack}.extraGates`) ?? 'config';
  for (const spec of pluginConfig.extraGates ?? []) {
    // Build the full gate from the spec once, then mark it skipped if needed — so
    // --plan --json serializes the declared shape even for skipped extras.
    const extraTimeoutMs =
      spec.timeout !== undefined
        ? (parseDuration(spec.timeout) ?? EXTRA_GATE_DEFAULT_TIMEOUT_MS)
        : EXTRA_GATE_DEFAULT_TIMEOUT_MS;
    const gate: Gate = {
      id: spec.id!,
      stack,
      label: `${spec.argv!.join(' ')} (from ${extraSource})`,
      argv: spec.argv!,
      cwd: spec.cwd !== undefined ? path.resolve(root, spec.cwd) : root,
      env: spec.env,
      timeoutMs: extraTimeoutMs,
      outputMeansFailure: spec.outputMeansFailure ?? false,
      driftMeansFailure: spec.driftMeansFailure,
      envFail: compileEnvFailRules(
        spec.envFail ?? [],
        `${stack}.extraGates.${spec.id}.envFail`,
        provenanceOf(provenance, `${stack}.extraGates`) ?? 'config'
      ).predicates,
      requires: toCommands(
        spec.requires,
        root,
        spec.cwd !== undefined ? path.resolve(root, spec.cwd) : root
      ),
      fixer:
        spec.fixer !== undefined
          ? toCommands(
              [spec.fixer],
              root,
              spec.cwd !== undefined ? path.resolve(root, spec.cwd) : root,
              extraTimeoutMs
            )[0]
          : undefined,
      skipped: null,
    };
    // extraGates can be declared project-wide and skipped personally — same visibility rule.
    effective.push(
      skip.has(gate.id) ? { ...gate, argv: [], skipped: `skipGates (${skipSource})` } : gate
    );
  }

  return effective;
}
