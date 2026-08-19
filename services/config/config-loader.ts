// @file: Per-repo config machinery — three-source discovery, deep-merge, per-key provenance.
// @consumers: stack-config, future config consumers
// @tasks: TSK-95

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { damerauLevenshtein } from '../../shared/common/damerau-levenshtein.ts';

/** Committable project config filename (YAML — comments; config.spec §1.1). */
export const PROJECT_CONFIG_FILENAME = 'gennady.yaml';

/** Personal config filename (JSON), used both in the repo and in $HOME. */
const RC_FILENAME = '.gennadyrc';

/** Duration string grammar: `<int><s|m|h>` (config.spec §2.3). */
const DURATION_RE = /^(\d+)(s|m|h)$/;

/**
 * @purpose One fatal config problem; any error stops the command before it acts (FR-CFG-04).
 * @consumer stack-config, verify.cmd
 */
export type ConfigError = {
  /** @purpose Dotted path of the offending key, e.g. `stack.golang.skipGate`. */
  readonly path: string;
  /** @purpose What is wrong, with a did-you-mean hint where applicable. */
  readonly message: string;
};

/**
 * @purpose One discovered config source.
 * @consumer loadConfigSection (internal)
 */
type RawSource = {
  /** @purpose Display name used in provenance and errors (basename or HOME-qualified). */
  readonly name: string;
  /** @purpose Raw section payload; undefined when the file or section is absent. */
  readonly stack: unknown;
  /** @purpose Parse failure, when the file exists but cannot be read as its format. */
  readonly error: ConfigError | null;
};

/**
 * @purpose Merged one section of the per-repo config, with provenance and parse errors.
 * @consumer stack-config, future consumers of other sections
 */
export type ConfigSectionLoad = {
  /** @purpose Merged section, or null when no source carries it. */
  readonly section: Record<string, unknown> | null;
  /** @purpose Parse errors; schema validation belongs to the section's owner. */
  readonly errors: readonly ConfigError[];
  /** @purpose Basenames of contributing files, highest priority first. */
  readonly sources: readonly string[];
  /** @purpose Winner file per dotted key path, relative to the section. */
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
export function unknownKeyError(keyPath: string, known: readonly string[]): ConfigError {
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
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @purpose Read one section of a JSON .gennadyrc. Only parse errors are fatal: a foreign
 *   section is its own consumer's problem.
 * @param dir Directory holding the rc file.
 * @param name Display name for provenance.
 * @param sectionName Top-level key to extract.
 * @returns Raw source.
 */
function readRcSource(dir: string, name: string, sectionName: string): RawSource {
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
    return { name, stack: doc[sectionName], error: null };
  } catch (cause) {
    return {
      name,
      stack: undefined,
      error: { path: name, message: `cannot parse JSON: ${(cause as Error).message}` },
    };
  }
}

/**
 * @purpose Read one section of the committable gennady.yaml.
 * @param root Repository root.
 * @param sectionName Top-level key to extract.
 * @returns Raw source.
 */
function readYamlSource(root: string, sectionName: string): RawSource {
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
    return { name, stack: doc[sectionName], error: null };
  } catch (cause) {
    return {
      name,
      stack: undefined,
      error: { path: name, message: `cannot parse YAML: ${(cause as Error).message}` },
    };
  }
}

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
 * @purpose Discover, merge and attribute ONE top-level section of the per-repo config.
 * @invariant Priority: repo .gennadyrc > gennady.yaml > HOME .gennadyrc; objects merge, leaves replace.
 * @invariant Knows nothing about any section's schema — validation belongs to the owning scope.
 * @param root Absolute repository root.
 * @param sectionName Top-level key to extract, e.g. `stack`.
 * @returns Merged section with provenance; parse errors are fatal for the caller.
 * @sideEffect IO: reads up to three config files.
 */
export function loadConfigSection(root: string, sectionName: string): ConfigSectionLoad {
  const home = process.env.HOME ?? '';
  const sources: RawSource[] = [
    ...(home.length > 0 && home !== root
      ? [readRcSource(home, `~/${RC_FILENAME}`, sectionName)]
      : []),
    readYamlSource(root, sectionName),
    readRcSource(root, RC_FILENAME, sectionName),
  ];

  const errors = sources.map((source) => source.error).filter((error) => error !== null);
  const provenance = new Map<string, string>();
  const merged: Record<string, unknown> = {};
  let seen = false;

  // Lowest priority first: a later source overwrites and claims provenance.
  for (const source of sources) {
    if (source.stack === undefined || source.stack === null) {
      continue;
    }
    if (typeof source.stack !== 'object' || Array.isArray(source.stack)) {
      errors.push({ path: sectionName, message: 'must be a mapping' });
      continue;
    }
    seen = true;
    mergeInto(merged, source.stack as Record<string, unknown>, source.name, '', provenance);
  }

  return {
    section: seen ? merged : null,
    errors,
    sources: sources
      .filter((source) => source.stack !== undefined)
      .map((source) => source.name)
      .reverse(),
    provenance,
  };
}
