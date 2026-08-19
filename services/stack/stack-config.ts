// @file: Stack config — three-source discovery, deep-merge with per-key provenance, strict validation.
// @consumers: verify.cmd
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { damerauLevenshtein } from '../../shared/common/damerau-levenshtein.ts';
import type { Gate, GateSpec, StackConfig, StackId, StackPluginConfig } from './stack.types.ts';

/** Committable project config filename (YAML — comments; config.spec §1.1). */
export const PROJECT_CONFIG_FILENAME = 'gennady.yaml';

/** Personal config filename (JSON; sections other than `stack` are outside this spec). */
const RC_FILENAME = '.gennadyrc';

/** Duration string grammar: `<int><s|m|h>` (config.spec §3.4). */
const DURATION_RE = /^(\d+)(s|m|h)$/;

/** Default timeout for extraGates entries that do not state one. */
const EXTRA_GATE_DEFAULT_TIMEOUT_MS = 10 * 60_000;

/** Known keys of a per-plugin config section (config.spec §3.3). */
const PLUGIN_SECTION_KEYS = ['skipGates', 'overrideGates', 'extraGates', 'fixers'] as const;

/** Known keys of a GateSpec (config.spec §3.4). */
const GATE_SPEC_KEYS = [
  'id',
  'argv',
  'cwd',
  'env',
  'timeout',
  'outputMeansFailure',
  'driftMeansFailure',
] as const;

/**
 * @purpose One fatal config problem; any error stops verify before gates run (FR-STACK-12).
 * @consumer verify.cmd
 */
export type StackConfigError = {
  /** @purpose Dotted path of the offending key, e.g. `stack.golang.skipGate`. */
  readonly path: string;
  /** @purpose What is wrong, with a did-you-mean hint where applicable. */
  readonly message: string;
};

/**
 * @purpose Result of loading the stack config.
 * @consumer verify.cmd
 */
export type StackConfigLoad = {
  /** @purpose Merged `stack` section, or null when no source carries one. */
  readonly config: StackConfig | null;
  /** @purpose Validation/parse errors; non-empty means verify must not run (exit 4). */
  readonly errors: readonly StackConfigError[];
  /** @purpose Basenames of the files that contributed, highest priority first. */
  readonly sources: readonly string[];
  /** @purpose Winner file per dotted key path (per-key provenance, config.spec §1.2). */
  readonly provenance: ReadonlyMap<string, string>;
};

/**
 * @purpose Parse a duration string into milliseconds.
 * @param value Duration such as `90s`, `5m`, `1h`.
 * @returns Milliseconds, or null when the string does not match the grammar.
 */
export function parseDuration(value: string): number | null {
  const match = DURATION_RE.exec(value);
  if (match === null) {
    return null;
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2] === 's' ? 1_000 : match[2] === 'm' ? 60_000 : 3_600_000;
  return amount * unit;
}

/**
 * @purpose Render milliseconds back into the shortest exact duration string for reports.
 * @param ms Milliseconds.
 * @returns Duration string such as `90s`, `5m`, `1h`.
 */
export function formatDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.round(ms / 1_000)}s`;
}

/**
 * @purpose Suggest the closest known key for a typo (simple edit distance).
 * @param unknown The unknown key.
 * @param known Candidate keys.
 * @returns The closest candidate, or null when nothing is plausibly close.
 */
function didYouMean(unknown: string, known: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of known) {
    const d = damerauLevenshtein(unknown.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= 3 ? best : null;
}

/**
 * @purpose Format the standard unknown-key error with a did-you-mean hint.
 * @param keyPath Dotted path of the unknown key.
 * @param known Keys that are valid at this level.
 * @returns Config error.
 */
function unknownKeyError(keyPath: string, known: readonly string[]): StackConfigError {
  const hint = didYouMean(keyPath.split('.').pop()!, known);
  return {
    path: keyPath,
    message: `unknown key${hint !== null ? ` (did you mean "${hint}"?)` : ''} — known: ${known.join(', ')}`,
  };
}

/**
 * @purpose Test for a plain object (not array, not null).
 * @param value Any value.
 * @returns True for plain objects.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// #region START_SOURCE_READING — each source yields its raw `stack` section or a parse error

/**
 * @purpose One discovered config source.
 * @consumer loadStackConfig (internal)
 */
type RawSource = {
  /** @purpose Display name used in provenance and errors (basename or HOME-qualified). */
  readonly name: string;
  /** @purpose Raw `stack` section; undefined when the file or section is absent. */
  readonly stack: unknown;
  /** @purpose Parse failure, when the file exists but cannot be read as its format. */
  readonly error: StackConfigError | null;
};

/**
 * @purpose Read the `stack` section of a JSON .gennadyrc; only parse errors are fatal —
 *   foreign sections (`models`) must not brick verify.
 * @param dir Directory holding the rc file.
 * @param name Display name for provenance.
 * @returns Raw source.
 */
function readRcSource(dir: string, name: string): RawSource {
  const filePath = path.join(dir, RC_FILENAME);
  if (!fs.existsSync(filePath)) {
    return { name, stack: undefined, error: null };
  }
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!isPlainObject(doc)) {
      // Legacy array form carries only models — no stack section, nothing for us.
      return { name, stack: undefined, error: null };
    }
    return { name, stack: doc['stack'], error: null };
  } catch (cause) {
    return {
      name,
      stack: undefined,
      error: { path: name, message: `cannot parse JSON: ${(cause as Error).message}` },
    };
  }
}

/**
 * @purpose Read the `stack` section of the committable gennady.yaml.
 * @param root Repository root.
 * @returns Raw source.
 */
function readYamlSource(root: string): RawSource {
  const name = PROJECT_CONFIG_FILENAME;
  const filePath = path.join(root, name);
  if (!fs.existsSync(filePath)) {
    return { name, stack: undefined, error: null };
  }
  try {
    const doc = parseYaml(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (doc === null || doc === undefined) {
      return { name, stack: undefined, error: null };
    }
    if (!isPlainObject(doc)) {
      return {
        name,
        stack: undefined,
        error: { path: name, message: 'top level must be a mapping' },
      };
    }
    return { name, stack: doc['stack'], error: null };
  } catch (cause) {
    return {
      name,
      stack: undefined,
      error: { path: name, message: `cannot parse YAML: ${(cause as Error).message}` },
    };
  }
}
// #endregion END_SOURCE_READING

/**
 * @purpose Deep-merge one source into the accumulator, tracking per-key provenance.
 * @invariant Objects merge recursively; scalars and arrays are replaced whole (config.spec §1.2).
 * @param target Accumulator object (mutated).
 * @param source Higher-priority source object.
 * @param sourceName Provenance tag for values this source sets.
 * @param keyPath Dotted path prefix.
 * @param provenance Provenance map (mutated).
 */
function mergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  sourceName: string,
  keyPath: string,
  provenance: Map<string, string>
): void {
  for (const [key, value] of Object.entries(source)) {
    const childPath = keyPath.length > 0 ? `${keyPath}.${key}` : key;
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key] as Record<string, unknown>, value, sourceName, childPath, provenance);
    } else {
      target[key] = value;
      provenance.set(childPath, sourceName);
      if (isPlainObject(value)) {
        // A subtree introduced wholesale: tag its leaves too, so lookups at any depth resolve.
        mergeInto(target[key] as Record<string, unknown>, value, sourceName, childPath, provenance);
      }
    }
  }
}

// #region START_VALIDATION — strict: any unknown key, wrong type or bad value is fatal

/**
 * @purpose Validate one GateSpec object.
 * @param spec Raw value from config.
 * @param keyPath Dotted path of the spec.
 * @param requireIdArgv True for extraGates/fixers entries, where id and argv are mandatory.
 * @param errors Error accumulator (mutated).
 * @param [forbidDriftFlag] True for fixers, which run in the real tree by definition (spec §4.4).
 */
function validateGateSpec(
  spec: unknown,
  keyPath: string,
  requireIdArgv: boolean,
  errors: StackConfigError[],
  forbidDriftFlag = false
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

  const { id, argv, cwd, env, timeout, outputMeansFailure, driftMeansFailure } = spec as GateSpec;
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
  if (driftMeansFailure !== undefined && forbidDriftFlag) {
    errors.push({
      path: `${keyPath}.driftMeansFailure`,
      message:
        'not allowed on a fixer — a fixer mutates the real tree by design, so drift is not a verdict (spec §4.4)',
    });
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
): StackConfigError[] {
  const errors: StackConfigError[] = [];
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

    for (const listKey of ['extraGates', 'fixers'] as const) {
      const list = section[listKey];
      if (list === undefined) {
        continue;
      }
      if (!Array.isArray(list)) {
        errors.push({ path: `stack.${key}.${listKey}`, message: 'must be an array of gate specs' });
        continue;
      }
      list.forEach((spec, index) =>
        validateGateSpec(
          spec,
          `stack.${key}.${listKey}[${index}]`,
          true,
          errors,
          listKey === 'fixers'
        )
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
  const home = process.env['HOME'] ?? '';
  // Lowest priority first: each later source overwrites on merge.
  const ordered: RawSource[] = [
    ...(home.length > 0 && home !== root ? [readRcSource(home, `~/${RC_FILENAME}`)] : []),
    readYamlSource(root),
    readRcSource(root, RC_FILENAME),
  ];

  const errors: StackConfigError[] = [];
  const provenance = new Map<string, string>();
  const merged: Record<string, unknown> = {};
  const sources: string[] = [];

  for (const source of ordered) {
    if (source.error !== null) {
      errors.push(source.error);
      continue;
    }
    if (source.stack === undefined) {
      continue;
    }
    if (!isPlainObject(source.stack)) {
      errors.push({ path: `${source.name}:stack`, message: 'must be an object' });
      continue;
    }
    sources.unshift(source.name);
    mergeInto(merged, source.stack, source.name, '', provenance);
  }

  if (sources.length === 0) {
    return { config: null, errors, sources: [], provenance };
  }

  const config = merged as StackConfig;
  errors.push(...validateStackConfig(config, builtinGateIds));
  return { config, errors, sources, provenance };
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
 * @purpose Look up the provenance of a config subtree by dotted-path prefix.
 * @param provenance Per-key provenance map.
 * @param prefix Dotted path, e.g. `golang.overrideGates.test`.
 * @returns The winner file of the first matching key, or null.
 */
export function provenanceOf(
  provenance: ReadonlyMap<string, string>,
  prefix: string
): string | null {
  const exact = provenance.get(prefix);
  if (exact !== undefined) {
    return exact;
  }
  for (const [key, source] of provenance) {
    if (key.startsWith(`${prefix}.`)) {
      return source;
    }
  }
  return null;
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
    const gate: Gate = {
      id: spec.id!,
      stack,
      label: `${spec.argv!.join(' ')} (from ${extraSource})`,
      argv: spec.argv!,
      cwd: spec.cwd !== undefined ? path.resolve(root, spec.cwd) : root,
      env: spec.env,
      timeoutMs:
        spec.timeout !== undefined
          ? (parseDuration(spec.timeout) ?? EXTRA_GATE_DEFAULT_TIMEOUT_MS)
          : EXTRA_GATE_DEFAULT_TIMEOUT_MS,
      outputMeansFailure: spec.outputMeansFailure ?? false,
      driftMeansFailure: spec.driftMeansFailure,
      skipped: null,
    };
    // extraGates can be declared project-wide and skipped personally — same visibility rule.
    effective.push(
      skip.has(gate.id) ? { ...gate, argv: [], skipped: `skipGates (${skipSource})` } : gate
    );
  }

  return effective;
}
