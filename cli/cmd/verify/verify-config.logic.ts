// @file: Load and strictly validate the `verify.gates` section of gennady.yaml.
// @consumers: verify.cmd
// @tasks: SPIKE-yaml-verify

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Default per-gate timeout when the config omits one. */
export const DEFAULT_GATE_TIMEOUT_MS = 10 * 60_000;

/** Keys allowed on a gate entry — anything else is a strict-validation error. */
const GATE_KEYS = new Set([
  'id',
  'argv',
  'cwd',
  'env',
  'timeout',
  'outputMeansFailure',
  'envFailPatterns',
]);

/** Gate id shape: short, greppable, CLI-friendly. */
const GATE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * @purpose A runnable verification gate resolved from config — pure data for the runner.
 * @consumer gate-runner.logic, verify.cmd
 */
export type VerifyGate = {
  /** @purpose Unique gate identifier, used by --only/--skip and in the report. */
  readonly id: string;
  /** @purpose argv, executed without a shell. */
  readonly argv: readonly string[];
  /** @purpose Absolute working directory. */
  readonly cwd: string;
  /** @purpose Environment variables merged over process.env. */
  readonly env?: Readonly<Record<string, string>>;
  /** @purpose Mandatory per-gate timeout in ms; the run's bound is the sum of the plan. */
  readonly timeoutMs: number;
  /** @purpose When true, any stdout on exit 0 means failure (`gofmt -l` contract). */
  readonly outputMeansFailure: boolean;
  /** @purpose Regexes reclassifying a non-zero exit as ENV_FAIL when the output matches. */
  readonly envFailPatterns?: readonly string[];
};

/**
 * @purpose One validation problem, addressed by its config path.
 * @consumer verify.cmd
 */
export type VerifyConfigError = {
  /** @purpose Dotted path of the offending key, e.g. `verify.gates[2].argv`. */
  readonly path: string;
  /** @purpose What is wrong and what shape is expected. */
  readonly message: string;
};

/**
 * @purpose Result of loading the verify config: gates, or null when no config declares any.
 * @consumer verify.cmd
 */
export type VerifyConfigLoad = {
  /** @purpose Ordered gates; null when gennady.yaml has no `verify` section. */
  readonly gates: readonly VerifyGate[] | null;
  /** @purpose Validation errors; any entry makes the load fatal (exit 4). */
  readonly errors: readonly VerifyConfigError[];
  /** @purpose Config file the gates came from, or null. */
  readonly source: string | null;
};

/**
 * @purpose Parse a duration string: `500ms`, `90s`, `5m`, `1h`.
 * @param raw Duration text.
 * @returns Milliseconds, or null when the text does not parse.
 */
export function parseDuration(raw: string): number | null {
  const match = /^(\d+)(ms|s|m|h)$/.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const value = Number(match[1]);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2] as 'ms' | 's' | 'm' | 'h'];
  return value * unit;
}

/** @purpose Narrow to a plain object (not array, not null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @purpose Validate one raw gate entry, collecting errors instead of throwing.
 * @param raw Entry from the yaml list.
 * @param at Dotted config path of this entry.
 * @param root Absolute repository root for cwd resolution.
 * @param errors Sink for validation problems.
 * @returns Resolved gate, or null when the entry is invalid.
 */
function validateGate(
  raw: unknown,
  at: string,
  root: string,
  errors: VerifyConfigError[]
): VerifyGate | null {
  const errorsBefore = errors.length;
  if (!isPlainObject(raw)) {
    errors.push({ path: at, message: 'must be a mapping with at least `id` and `argv`' });
    return null;
  }

  for (const key of Object.keys(raw)) {
    if (!GATE_KEYS.has(key)) {
      errors.push({
        path: `${at}.${key}`,
        message: `unknown key — known: ${[...GATE_KEYS].join(', ')}`,
      });
    }
  }

  const id = raw['id'];
  if (typeof id !== 'string' || !GATE_ID_RE.test(id)) {
    errors.push({
      path: `${at}.id`,
      message: 'required: a short identifier like `lint` or `test-unit`',
    });
  }
  const argv = raw['argv'];
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    argv.some((a) => typeof a !== 'string' || a.length === 0)
  ) {
    errors.push({
      path: `${at}.argv`,
      message: 'required: a non-empty array of strings (executed without a shell)',
    });
  }
  if (raw['cwd'] !== undefined && typeof raw['cwd'] !== 'string') {
    errors.push({ path: `${at}.cwd`, message: 'must be a string path relative to the repo root' });
  }
  const env = raw['env'];
  if (
    env !== undefined &&
    (!isPlainObject(env) || Object.values(env).some((v) => typeof v !== 'string'))
  ) {
    errors.push({ path: `${at}.env`, message: 'must be a mapping of string values' });
  }
  let timeoutMs = DEFAULT_GATE_TIMEOUT_MS;
  if (raw['timeout'] !== undefined) {
    const parsed = typeof raw['timeout'] === 'string' ? parseDuration(raw['timeout']) : null;
    if (parsed === null) {
      errors.push({ path: `${at}.timeout`, message: 'must be a duration like `90s`, `5m`, `1h`' });
    } else {
      timeoutMs = parsed;
    }
  }
  if (raw['outputMeansFailure'] !== undefined && typeof raw['outputMeansFailure'] !== 'boolean') {
    errors.push({ path: `${at}.outputMeansFailure`, message: 'must be a boolean' });
  }
  const patterns = raw['envFailPatterns'];
  if (patterns !== undefined) {
    if (
      !Array.isArray(patterns) ||
      patterns.length === 0 ||
      patterns.some((p) => typeof p !== 'string' || p.length === 0)
    ) {
      errors.push({
        path: `${at}.envFailPatterns`,
        message: 'must be a non-empty array of regular-expression strings',
      });
    } else {
      patterns.forEach((pattern: string, patternIndex: number) => {
        try {
          new RegExp(pattern, 'm');
        } catch {
          errors.push({
            path: `${at}.envFailPatterns[${patternIndex}]`,
            message: `invalid regular expression: ${pattern}`,
          });
        }
      });
    }
  }

  // Only this entry's own problems invalidate it — the sink is shared across gates.
  if (errors.length > errorsBefore) {
    return null;
  }
  return {
    id: id as string,
    argv: argv as string[],
    cwd: raw['cwd'] !== undefined ? path.resolve(root, raw['cwd'] as string) : root,
    env: env as Record<string, string> | undefined,
    timeoutMs,
    outputMeansFailure: (raw['outputMeansFailure'] as boolean | undefined) ?? false,
    envFailPatterns: patterns as string[] | undefined,
  };
}

/**
 * @purpose Load `verify.gates` from `<root>/gennady.yaml` with strict validation.
 * @invariant Any validation error is fatal — no gate runs on a config the user did not intend.
 * @param root Absolute repository root.
 * @returns Gates in declaration order; `gates: null` when no config declares a verify section.
 */
export function loadVerifyConfig(root: string): VerifyConfigLoad {
  const file = path.join(root, 'gennady.yaml');
  if (!fs.existsSync(file)) {
    return { gates: null, errors: [], source: null };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    return {
      gates: null,
      errors: [{ path: 'gennady.yaml', message: `cannot parse: ${String(error)}` }],
      source: file,
    };
  }

  if (!isPlainObject(parsed) || parsed['verify'] === undefined) {
    return { gates: null, errors: [], source: file };
  }

  const errors: VerifyConfigError[] = [];
  const verify = parsed['verify'];
  if (!isPlainObject(verify)) {
    return {
      gates: null,
      errors: [{ path: 'verify', message: 'must be a mapping with a `gates` list' }],
      source: file,
    };
  }
  for (const key of Object.keys(verify)) {
    if (key !== 'gates') {
      errors.push({ path: `verify.${key}`, message: 'unknown key — known: gates' });
    }
  }
  const rawGates = verify['gates'];
  if (!Array.isArray(rawGates) || rawGates.length === 0) {
    errors.push({ path: 'verify.gates', message: 'must be a non-empty list of gate mappings' });
    return { gates: null, errors, source: file };
  }

  const gates: VerifyGate[] = [];
  const seen = new Set<string>();
  rawGates.forEach((raw, index) => {
    // Duplicate ids are checked independently of the entry's own validity.
    const rawId = isPlainObject(raw) && typeof raw['id'] === 'string' ? raw['id'] : null;
    if (rawId !== null && seen.has(rawId)) {
      errors.push({ path: `verify.gates[${index}].id`, message: `duplicate id \`${rawId}\`` });
      return;
    }
    if (rawId !== null) {
      seen.add(rawId);
    }
    const gate = validateGate(raw, `verify.gates[${index}]`, root, errors);
    if (gate !== null) {
      gates.push(gate);
    }
  });

  return errors.length > 0
    ? { gates: null, errors, source: file }
    : { gates, errors: [], source: file };
}
