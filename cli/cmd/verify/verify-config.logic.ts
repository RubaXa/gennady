// @file: Load and strictly validate the `verify.gates` section of gennady.yaml.
// @consumers: verify.cmd
// @tasks: SPIKE-yaml-verify

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Default per-gate timeout when the config omits one. */
export const DEFAULT_GATE_TIMEOUT_MS = 10 * 60_000;

/** Keys allowed on a gate mapping — anything else is a strict-validation error. */
const GATE_KEYS = new Set([
  'cmd',
  'cwd',
  'env',
  'timeout',
  'outputMeansFailure',
  'envFailPatterns',
]);

/** Gate name shape: starts with a letter so JS object key order stays declaration order. */
const GATE_ID_RE = /^[a-z][a-z0-9_-]*$/i;

/**
 * @purpose A runnable verification gate resolved from config — pure data for the runner.
 * @consumer gate-runner.logic, verify.cmd
 */
export type VerifyGate = {
  /** @purpose Unique gate name (the mapping key), used by --only/--skip and in the report. */
  readonly id: string;
  /** @purpose Tokenized command, executed without a shell. */
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
  /** @purpose Dotted path of the offending key, e.g. `verify.gates.lint.cmd`. */
  readonly path: string;
  /** @purpose What is wrong and what shape is expected. */
  readonly message: string;
};

/**
 * @purpose Result of loading the verify config: gates, or null when no config declares any.
 * @consumer verify.cmd
 */
export type VerifyConfigLoad = {
  /** @purpose Gates in declaration order; null when gennady.yaml has no `verify` section. */
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

/**
 * @purpose Split a command string into argv, honouring quotes. No shell: pipes and
 *   globs are plain text — use `sh -c "…"` explicitly.
 * @param cmd Command text, e.g. `swiftlint lint --config "My App/.swiftlint.yml"`.
 * @returns argv tokens, or null on an unbalanced quote.
 */
export function tokenizeCommand(cmd: string): string[] | null {
  const argv: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (const char of cmd) {
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (hasToken) {
        argv.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (quote !== null) {
    return null;
  }
  if (hasToken) {
    argv.push(current);
  }
  return argv;
}

/** @purpose Narrow to a plain object (not array, not null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @purpose Validate one gate: a `cmd` string shorthand, or a mapping with `cmd` plus options.
 * @param name Gate name (the mapping key).
 * @param raw Value from the yaml mapping.
 * @param root Absolute repository root for cwd resolution.
 * @param errors Sink for validation problems.
 * @returns Resolved gate, or null when the entry is invalid.
 */
function validateGate(
  name: string,
  raw: unknown,
  root: string,
  errors: VerifyConfigError[]
): VerifyGate | null {
  const at = `verify.gates.${name}`;
  const errorsBefore = errors.length;

  if (!GATE_ID_RE.test(name)) {
    errors.push({ path: at, message: 'gate name must start with a letter: `lint`, `test-unit`' });
  }

  // #region START_SHAPE — a plain string is shorthand for { cmd: <string> }
  const spec: Record<string, unknown> =
    typeof raw === 'string' ? { cmd: raw } : isPlainObject(raw) ? raw : {};
  if (typeof raw !== 'string' && !isPlainObject(raw)) {
    errors.push({ path: at, message: 'must be a command string or a mapping with `cmd`' });
    return null;
  }
  // #endregion END_SHAPE

  for (const key of Object.keys(spec)) {
    if (!GATE_KEYS.has(key)) {
      errors.push({
        path: `${at}.${key}`,
        message: `unknown key — known: ${[...GATE_KEYS].join(', ')}`,
      });
    }
  }

  let argv: string[] | null = null;
  if (typeof spec['cmd'] !== 'string' || spec['cmd'].trim().length === 0) {
    errors.push({
      path: `${at}.cmd`,
      message: 'required: a command string (executed without a shell)',
    });
  } else {
    argv = tokenizeCommand(spec['cmd']);
    if (argv === null || argv.length === 0) {
      errors.push({ path: `${at}.cmd`, message: 'unbalanced quote or empty command' });
    }
  }
  if (spec['cwd'] !== undefined && typeof spec['cwd'] !== 'string') {
    errors.push({ path: `${at}.cwd`, message: 'must be a string path relative to the repo root' });
  }
  const env = spec['env'];
  if (
    env !== undefined &&
    (!isPlainObject(env) || Object.values(env).some((v) => typeof v !== 'string'))
  ) {
    errors.push({ path: `${at}.env`, message: 'must be a mapping of string values' });
  }
  let timeoutMs = DEFAULT_GATE_TIMEOUT_MS;
  if (spec['timeout'] !== undefined) {
    const parsed = typeof spec['timeout'] === 'string' ? parseDuration(spec['timeout']) : null;
    if (parsed === null) {
      errors.push({ path: `${at}.timeout`, message: 'must be a duration like `90s`, `5m`, `1h`' });
    } else {
      timeoutMs = parsed;
    }
  }
  if (spec['outputMeansFailure'] !== undefined && typeof spec['outputMeansFailure'] !== 'boolean') {
    errors.push({ path: `${at}.outputMeansFailure`, message: 'must be a boolean' });
  }
  const patterns = spec['envFailPatterns'];
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
    id: name,
    argv: argv!,
    cwd: spec['cwd'] !== undefined ? path.resolve(root, spec['cwd'] as string) : root,
    env: env as Record<string, string> | undefined,
    timeoutMs,
    outputMeansFailure: (spec['outputMeansFailure'] as boolean | undefined) ?? false,
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
      errors: [{ path: 'verify', message: 'must be a mapping with a `gates` mapping' }],
      source: file,
    };
  }
  for (const key of Object.keys(verify)) {
    if (key !== 'gates') {
      errors.push({ path: `verify.${key}`, message: 'unknown key — known: gates' });
    }
  }
  const rawGates = verify['gates'];
  if (!isPlainObject(rawGates) || Object.keys(rawGates).length === 0) {
    errors.push({
      path: 'verify.gates',
      message: 'must be a non-empty mapping: `<name>: <cmd>` or `<name>: { cmd: …, timeout: … }`',
    });
    return { gates: null, errors, source: file };
  }

  const gates: VerifyGate[] = [];
  for (const [name, raw] of Object.entries(rawGates)) {
    const gate = validateGate(name, raw, root, errors);
    if (gate !== null) {
      gates.push(gate);
    }
  }

  return errors.length > 0
    ? { gates: null, errors, source: file }
    : { gates, errors: [], source: file };
}
