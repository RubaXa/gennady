// @file: Exact-match readiness check for the required v2 npm scripts — pure, no name-guessing.
// @consumers: sdd-state.cmd
// @tasks: N/A

/**
 * @purpose The exact npm script names a v2-ready Node project must declare.
 * @invariant Matched by exact name only — no classifier, no fuzzy `type-?check` guessing.
 */
export const REQUIRED_SCRIPTS = ['typecheck', 'test', 'test:coverage', 'lint', 'format'] as const;

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
    present: scripts[name] !== undefined,
  }));

  const lintHasGennady = lintReachesGennady(scripts);

  const missing: string[] = [];
  if (!packageJsonPresent) missing.push('package.json');
  missing.push(...required.filter((r) => !r.present).map((r) => r.name));
  if (scripts['lint'] !== undefined && !lintHasGennady) missing.push('lint→gennady');
  if (!gennadyAvailable) missing.push('gennady (not installed)');

  const ready =
    packageJsonPresent && required.every((r) => r.present) && lintHasGennady && gennadyAvailable;

  return { packageJsonPresent, required, lintHasGennady, gennadyAvailable, ready, missing };
}
