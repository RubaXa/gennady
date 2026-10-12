// @file: ENV_FAIL classification — predicate combinators and the config rule compiler.
// @consumers: gate-runner, stack-config, plugins
// @tasks: TSK-95

import type { EnvFailPredicate, EnvFailStream } from './stack.types.ts';

/**
 * @purpose One config schema error: dotted path plus the human reason.
 * @consumer stack-config (merged into its own error list)
 */
export type EnvFailRuleError = {
  /** @purpose Dotted config path of the offending rule or key. */
  readonly path: string;
  /** @purpose Human reason, including the grammar when a condition failed to parse. */
  readonly message: string;
};

/** Keys a config-declared envFail rule may carry (config.spec §3.4). */
export const ENV_FAIL_RULE_KEYS = [
  'exitCodeMatches',
  'stdoutMatches',
  'stderrMatches',
  'outputMatches',
  'hint',
] as const;

/** Grammar of one exit-code condition; two-char operators first so `>=` is not read as `>`. */
const CONDITION_RE = /^(==|!=|>=|<=|>|<)\s*(\d+)$/;

/** Conditions that match every failure, making a gate unable to report FAIL ever again. */
const CATCH_ALL_CONDITIONS = ['>0', '>=1', '!=0'];

/** Streams a rule may match against. */
const STREAMS: readonly EnvFailStream[] = ['stdout', 'stderr', 'output'];

/**
 * @purpose Predicate: the exit code satisfies every condition (`'>1'`, `['>=64', '<=78']`).
 * @invariant A null exit code never matches: JS coerces null to 0, so `>=`/`<=`/`!=` would misfire.
 * @param conditions One condition or a list, ANDed; a bare number means equality.
 * @param [hint] Fix-the-environment instruction appended when the predicate matches.
 * @returns EnvFailPredicate of kind `exit`.
 */
export function exitCodeMatches(
  conditions: string | number | readonly (string | number)[],
  hint?: string
): EnvFailPredicate {
  const list = (Array.isArray(conditions) ? conditions : [conditions]).map((entry) =>
    typeof entry === 'number' ? `==${entry}` : entry.trim()
  );
  const parsed = list.map((entry) => {
    const match = CONDITION_RE.exec(entry);
    if (match === null) {
      throw new Error(`invalid exit-code condition ${JSON.stringify(entry)}`);
    }
    return { operator: match[1]!, value: Number(match[2]) };
  });

  return Object.assign(
    (outcome: { exitCode: number | null }): boolean => {
      const code = outcome.exitCode;
      if (code === null) {
        return false;
      }
      return parsed.every(({ operator, value }) => {
        switch (operator) {
          case '==':
            return code === value;
          case '!=':
            return code !== value;
          case '>':
            return code > value;
          case '<':
            return code < value;
          case '>=':
            return code >= value;
          default:
            return code <= value;
        }
      });
    },
    {
      hint,
      kind: 'exit' as const,
      describe: parsed.map((c) => `exit ${c.operator} ${c.value}`).join(' && '),
    }
  );
}

/**
 * @purpose Predicate: the named stream matches the pattern; `output` is stdout+stderr.
 * @param stream Stream to test.
 * @param pattern Regular expression, compiled with `m` by the caller.
 * @param [hint] Fix-the-environment instruction appended when the predicate matches.
 * @returns EnvFailPredicate of kind `output`.
 */
export function streamMatches(
  stream: EnvFailStream,
  pattern: RegExp,
  hint?: string
): EnvFailPredicate {
  return Object.assign(
    (outcome: Record<EnvFailStream, string>): boolean => pattern.test(outcome[stream]),
    { hint, kind: 'output' as const, describe: `${stream} ~ ${String(pattern)}` }
  );
}

/**
 * @purpose Predicate over the combined output — the stream-agnostic form that survives `2>&1`.
 * @param pattern Regular expression tested against stdout+stderr.
 * @param [hint] Fix-the-environment instruction appended when the predicate matches.
 * @returns EnvFailPredicate of kind `output`.
 */
export function outputMatches(pattern: RegExp, hint?: string): EnvFailPredicate {
  return streamMatches('output', pattern, hint);
}

/**
 * @purpose Combine predicates so a rule's conditions must all hold (AND within one rule).
 * @param parts Predicates to combine; at least one.
 * @param [hint] Hint carried by the combined predicate.
 * @returns EnvFailPredicate matching only when every part matches.
 */
export function allOf(parts: readonly EnvFailPredicate[], hint?: string): EnvFailPredicate {
  if (parts.length === 1) {
    return hint === undefined
      ? parts[0]!
      : Object.assign(parts[0]!.bind(null), { ...parts[0]!, hint });
  }
  const kind = parts.every((part) => part.kind === 'exit')
    ? ('exit' as const)
    : ('output' as const);
  return Object.assign(
    (outcome: Parameters<EnvFailPredicate>[0]): boolean => parts.every((part) => part(outcome)),
    { hint, kind, describe: parts.map((part) => part.describe).join(' && ') }
  );
}

/**
 * @purpose Compile config-declared envFail rules into predicates, collecting schema errors.
 * @invariant Every error is returned, never thrown — the loader reports the full list at exit 4.
 * @param rules Raw value of the `envFail` key.
 * @param keyPath Dotted config path used in error messages.
 * @param [source] Config file the rules came from, reported when a rule matches.
 * @returns Compiled predicates plus any config errors found.
 */
export function compileEnvFailRules(
  rules: unknown,
  keyPath: string,
  source?: string
): { predicates: EnvFailPredicate[]; errors: EnvFailRuleError[] } {
  const errors: EnvFailRuleError[] = [];
  const predicates: EnvFailPredicate[] = [];

  if (!Array.isArray(rules)) {
    return { predicates, errors: [{ path: keyPath, message: 'must be an array of rules' }] };
  }

  rules.forEach((rule, index) => {
    const at = `${keyPath}[${index}]`;
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
      errors.push({ path: at, message: 'must be an object' });
      return;
    }
    const entries = rule as Record<string, unknown>;
    for (const key of Object.keys(entries)) {
      if (!(ENV_FAIL_RULE_KEYS as readonly string[]).includes(key)) {
        errors.push({
          path: `${at}.${key}`,
          message: `unknown key — known: ${ENV_FAIL_RULE_KEYS.join(', ')}`,
        });
      }
    }

    const hint = entries['hint'];
    if (typeof hint !== 'string' || hint.length === 0) {
      errors.push({
        path: `${at}.hint`,
        message:
          'required non-empty string — an ENV_FAIL without remediation tells an agent nothing',
      });
    }

    const parts: EnvFailPredicate[] = [];
    let discriminating = false;

    const rawExit = entries['exitCodeMatches'];
    if (rawExit !== undefined) {
      const list = (Array.isArray(rawExit) ? rawExit : [rawExit]) as readonly (string | number)[];
      // Inner whitespace is stripped too, not just the ends: the grammar accepts `> 0`, and
      // comparing that raw string against the catch-all list let a rule matching EVERY failure
      // past the guard — the gate could then never report FAIL again.
      const normalized = list.map((entry) =>
        typeof entry === 'number' ? `==${entry}` : String(entry).replace(/\s+/g, '')
      );
      const invalid = normalized.filter((entry) => CONDITION_RE.exec(entry) === null);
      if (invalid.length > 0) {
        errors.push({
          path: `${at}.exitCodeMatches`,
          message:
            `invalid condition(s) ${invalid.map((e) => JSON.stringify(e)).join(', ')} — ` +
            'grammar: <op><int> with op one of == != >= <= > < (quote the value in YAML: ">" starts a block scalar and "!" a tag)',
        });
      } else {
        parts.push(exitCodeMatches(normalized));
        if (!normalized.every((entry) => CATCH_ALL_CONDITIONS.includes(entry))) {
          discriminating = true;
        }
      }
    }

    for (const stream of STREAMS) {
      const key = stream === 'output' ? 'outputMatches' : `${stream}Matches`;
      const source = entries[key];
      if (source === undefined) {
        continue;
      }
      if (typeof source !== 'string' || source.trim().length === 0) {
        errors.push({ path: `${at}.${key}`, message: 'must be a non-empty regular expression' });
        continue;
      }
      try {
        parts.push(streamMatches(stream, new RegExp(source, 'm')));
        discriminating = true;
      } catch (cause) {
        errors.push({
          path: `${at}.${key}`,
          message: `invalid regexp: ${(cause as Error).message}`,
        });
      }
    }

    if (parts.length === 0) {
      errors.push({
        path: at,
        message: `needs at least one condition — one of ${ENV_FAIL_RULE_KEYS.slice(0, 4).join(', ')}`,
      });
      return;
    }
    if (!discriminating) {
      errors.push({
        path: at,
        message:
          'every failure would match this rule, so the gate could never report FAIL again — ' +
          'add a discriminating condition, or use skipGates if the gate should not run',
      });
      return;
    }
    const compiled = allOf(parts, typeof hint === 'string' ? hint : undefined);
    predicates.push(
      source === undefined ? compiled : Object.assign(compiled.bind(null), { ...compiled, source })
    );
  });

  return { predicates, errors };
}
