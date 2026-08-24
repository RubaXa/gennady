// @file: Exact-match readiness check for the required v2 npm scripts — pure check, plus the one
// disk-gathering helper every caller needs to build its input (no name-guessing).
// @consumers: sdd-state.cmd, sdd-task.cmd
// @tasks: N/A

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @purpose The exact npm script names a v2-ready Node project must declare.
 * @invariant Matched by exact name only — no fuzzy guessing. `type-check` also accepts `typecheck`
 * via SCRIPT_ALIASES — still exact-match against a closed set.
 */
export const REQUIRED_SCRIPTS = [
  'type-check',
  'test',
  'test:coverage',
  'lint',
  'format',
  'check',
  'fix',
] as const;

/**
 * @purpose Alternate spellings accepted for one required script; every other name has exactly one.
 * Canonical/displayed name stays `type-check`, even if the project spells it `typecheck`.
 */
const SCRIPT_ALIASES: Partial<Record<(typeof REQUIRED_SCRIPTS)[number], readonly string[]>> = {
  'type-check': ['type-check', 'typecheck'],
};

/** @purpose One required script and whether it is declared. */
export type RequiredScript = {
  /** @purpose Exact script name. */
  name: string;
  /** @purpose True when package.json `scripts` declares this exact name. */
  present: boolean;
};

/**
 * @purpose The deterministic tooling facts the caller gathers from disk before checking readiness.
 * @invariant `scripts` is empty (not partial) whenever `packageJsonPresent` is false.
 */
export type ReadinessInput = {
  /** @purpose Whether a parseable package.json was found at the project root. */
  packageJsonPresent: boolean;
  /** @purpose The package.json `scripts` map (name → body); empty when package.json is absent. */
  scripts: Record<string, string>;
  /** @purpose Whether the gennady CLI is installed for the project (node_modules/.bin/gennady). */
  gennadyAvailable: boolean;
};

/**
 * @purpose Verdict of the readiness check.
 * @invariant `ready` is true only when package.json is present, every required script is declared, `lint` reaches gennady, AND gennady is installed.
 */
export type ReadinessResult = {
  /** @purpose Whether a parseable package.json exists at the project root. */
  packageJsonPresent: boolean;
  /** @purpose Per-required-script presence, in REQUIRED_SCRIPTS order. */
  required: RequiredScript[];
  /** @purpose Whether the `lint` script (or a script it chains via `npm run`) invokes gennady. */
  lintHasGennady: boolean;
  /** @purpose Whether `check` and every npm script it reaches are free of known write/autofix commands. */
  checkReadOnly: boolean;
  /** @purpose Whether the gennady CLI is installed for the project. */
  gennadyAvailable: boolean;
  /** @purpose True when the project is ready (package.json + all required present + gennady in lint + gennady installed). */
  ready: boolean;
  /** @purpose Human-readable list of what is missing (package.json, script names, `lint→gennady`, gennady install). */
  missing: string[];
};

/**
 * @purpose Resolve whether `lint` reaches a gennady invocation, following `npm run <x>` chains deterministically.
 * @param scripts The package.json scripts map.
 * @returns True when gennady is reachable from the `lint` script.
 */
function lintReachesGennady(scripts: Record<string, string>): boolean {
  const lint = scripts['lint'];
  if (lint === undefined) return false;

  const seen = new Set<string>();
  const queue: string[] = [lint];
  while (queue.length > 0) {
    const body = queue.shift();
    if (body === undefined) continue;
    if (/\bgennady\b/.test(body)) return true;
    for (const m of body.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
      const ref = m[1];
      if (ref && !seen.has(ref) && scripts[ref] !== undefined) {
        seen.add(ref);
        queue.push(scripts[ref] as string);
      }
    }
  }
  return false;
}

/** @purpose Resolve a script's transitive npm-run bodies once, including the entry body. */
function reachableScriptBodies(scripts: Record<string, string>, entry: string): string[] {
  const first = scripts[entry];
  if (first === undefined) return [];
  const bodies: string[] = [];
  const seen = new Set<string>([entry]);
  const queue = [first];
  while (queue.length > 0) {
    const body = queue.shift();
    if (body === undefined) continue;
    bodies.push(body);
    for (const match of body.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
      const name = match[1];
      if (name && !seen.has(name) && scripts[name] !== undefined) {
        seen.add(name);
        queue.push(scripts[name]);
      }
    }
  }
  return bodies;
}

/** @purpose Detect the known formatter/linter write switches forbidden in the read-only `check` graph. */
function isCheckReadOnly(scripts: Record<string, string>): boolean {
  const bodies = reachableScriptBodies(scripts, 'check');
  if (bodies.length === 0) return false;
  return bodies.every(
    (body) => !/(?:eslint\b[^&|;\n]*\s--fix\b|prettier\b[^&|;\n]*\s--write\b)/.test(body)
  );
}

/**
 * @purpose True when a script body is real — present, non-empty, and not the npm-init placeholder.
 * @param body The script body from package.json `scripts`, or undefined when absent.
 * @returns False for absent/empty bodies and for the `npm init -y` "no test specified" stub.
 */
export function isRealScript(body: string | undefined): boolean {
  if (body === undefined || body.trim() === '') return false;
  return !body.includes('no test specified');
}

/**
 * @purpose Check the gathered tooling facts against the exact v2 readiness requirements.
 * @invariant Exact-name script match only; `lint` must reach gennady; gennady must be installed; package.json must exist.
 * @param input The gathered facts: package.json presence, the `scripts` map, and gennady install state.
 * @returns A ReadinessResult: presence flags, per-script presence, overall readiness, and the missing list.
 */
export function checkReadiness(input: ReadinessInput): ReadinessResult {
  const { packageJsonPresent, scripts, gennadyAvailable } = input;

  const required: RequiredScript[] = REQUIRED_SCRIPTS.map((name) => ({
    name,
    present: (SCRIPT_ALIASES[name] ?? [name]).some((n) => isRealScript(scripts[n])),
  }));

  const lintHasGennady = lintReachesGennady(scripts);
  const checkReadOnly = isCheckReadOnly(scripts);

  const missing: string[] = [];
  if (!packageJsonPresent) missing.push('package.json');
  missing.push(...required.filter((r) => !r.present).map((r) => r.name));
  if (scripts['lint'] !== undefined && !lintHasGennady) missing.push('lint→gennady');
  if (scripts['check'] !== undefined && !checkReadOnly) missing.push('check(read-only)');
  if (!gennadyAvailable) missing.push('gennady (not installed)');

  const ready =
    packageJsonPresent &&
    required.every((r) => r.present) &&
    lintHasGennady &&
    checkReadOnly &&
    gennadyAvailable;

  return {
    packageJsonPresent,
    required,
    lintHasGennady,
    checkReadOnly,
    gennadyAvailable,
    ready,
    missing,
  };
}

/**
 * @purpose Detect whether the gennady CLI is installed for the project.
 * @param root Absolute project root.
 * @returns True when `<root>/node_modules/.bin/gennady` resolves to an existing entry.
 */
function detectGennady(root: string): boolean {
  try {
    statSync(join(root, 'node_modules', '.bin', 'gennady'));
    return true;
  } catch {
    return false;
  }
}

/**
 * @purpose Gather the on-disk facts `checkReadiness` needs, from a project root — the one shared
 * disk-read every caller (sdd-state, sdd-task) otherwise re-implements.
 * @param root Absolute project root.
 * @returns A ReadinessInput: package.json presence + its `scripts` map (empty when absent), and
 * gennady install state.
 */
export function gatherReadinessInput(root: string): ReadinessInput {
  let scripts: Record<string, string> = {};
  let packageJsonPresent = false;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    packageJsonPresent = true;
    scripts = pkg.scripts ?? {};
  } catch {
    packageJsonPresent = false;
  }
  return { packageJsonPresent, scripts, gennadyAvailable: detectGennady(root) };
}
