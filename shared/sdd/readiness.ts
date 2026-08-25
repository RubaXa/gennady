// @file: Exact-match readiness check for the required v2 npm scripts — pure check, plus the one
// disk-gathering helper every caller needs to build its input (no name-guessing).
// @consumers: sdd-state.cmd, sdd-task.cmd
// @tasks: N/A

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @purpose The exact npm script names a v2-ready project must declare — sdd-verify's seven bricks.
 * check/fix are wrappers, not required.
 * @invariant Matched by exact name only — no fuzzy guessing. `type-check` also accepts `typecheck`
 * via SCRIPT_ALIASES — still exact-match against a closed set.
 */
export const REQUIRED_SCRIPTS = [
  'type-check',
  'test',
  'test:coverage',
  'format',
  'format:fix',
  'lint',
  'lint:fix',
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

/** @purpose Three-level readiness verdict — `provisional` means the bricks exist but some are echo-stubs. */
export type ReadinessLevel = 'not-ready' | 'provisional' | 'ready';

/**
 * @purpose Verdict of the readiness check.
 * @invariant `ready` requires package.json present, all required scripts declared, `lint` reaching
 * gennady, `format`/`lint` read-only, `format:fix`/`lint:fix` mutating, and gennady installed.
 * @invariant `level` refines `ready`: `not-ready` ⇔ `!ready`; `provisional` = ready with ≥1
 * echo-stub; `ready` = zero stubs. `executionReady` ⇔ `level === 'ready'`.
 */
export type ReadinessResult = {
  /** @purpose Whether a parseable package.json exists at the project root. */
  packageJsonPresent: boolean;
  /** @purpose Per-required-script presence, in REQUIRED_SCRIPTS order. */
  required: RequiredScript[];
  /** @purpose Whether the `lint` script (or a script it chains via `npm run`) invokes gennady. */
  lintHasGennady: boolean;
  /** @purpose Whether `format` and every npm script it reaches are free of known write/autofix commands. */
  formatReadOnly: boolean;
  /** @purpose Whether `lint` and every npm script it reaches are free of known write/autofix commands. */
  lintReadOnly: boolean;
  /** @purpose Whether `check`, if present, and everything it reaches stay write-free — checked to catch a homemade mutating `check`, though `check` is optional. */
  checkReadOnly: boolean;
  /** @purpose Whether `format:fix`, if present, or a script it reaches carries a mutating switch. */
  formatFixMutates: boolean;
  /** @purpose Whether `lint:fix`, if present, or a script it reaches carries a mutating switch. */
  lintFixMutates: boolean;
  /** @purpose Whether the gennady CLI is installed for the project. */
  gennadyAvailable: boolean;
  /** @purpose True when the project is ready (package.json + all required present + gennady in lint + gennady installed). */
  ready: boolean;
  /** @purpose Human-readable list of what is missing (package.json, script names, `lint→gennady`, gennady install). */
  missing: string[];
  /** @purpose Required scripts present but vacuous — a no-op stub, or a real command with `|| true` swallowing its exit code; never in `missing`. */
  stubbed: string[];
  /** @purpose Refined verdict: `not-ready` / `provisional` (bootstrap/scaffold may proceed, code phases may not) / `ready` (execution may proceed). */
  level: ReadinessLevel;
  /** @purpose True only at `level === 'ready'` — the gate for impl/refactor/test phases; bootstrap phases need only `ready`. */
  executionReady: boolean;
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

/** @purpose The known formatter/linter write switches forbidden in a read-only script graph. */
const WRITE_SWITCH_PATTERN =
  /(?:eslint\b[^&|;\n]*\s--fix\b|prettier\b[^&|;\n]*\s--write\b|\s--autofix\b)/;

/**
 * @purpose Detect whether `entry` and every npm script it transitively `npm run`s are free of the
 * known write/autofix switches.
 * @invariant Write variants belong in `*:fix` siblings, invoked only from `fix` — which this check
 * deliberately never runs on.
 * @param scripts The package.json scripts map.
 * @param entry The script name to check (e.g. `format`, `lint`, `check`).
 * @returns False when `entry` is absent, or when any reachable body contains a write switch.
 */
function isScriptReadOnly(scripts: Record<string, string>, entry: string): boolean {
  const bodies = reachableScriptBodies(scripts, entry);
  if (bodies.length === 0) return false;
  return bodies.every((body) => !WRITE_SWITCH_PATTERN.test(body));
}

/** @purpose Any of the three mutating switches a fixer script (`format:fix`, `lint:fix`) must carry. */
const MUTATING_SWITCH_PATTERN = /\s--(?:write|fix|autofix)\b/;

/**
 * @purpose Detect whether `entry` or a script it transitively reaches mutates — a fixer with no
 * --write/--fix/--autofix is a configuration error.
 * @param scripts The package.json scripts map.
 * @param entry The fixer script name (`format:fix` or `lint:fix`).
 * @returns False when `entry` is absent, or when no reachable body carries a mutating switch.
 */
function isScriptMutating(scripts: Record<string, string>, entry: string): boolean {
  const bodies = reachableScriptBodies(scripts, entry);
  if (bodies.length === 0) return false;
  return bodies.some((body) => MUTATING_SWITCH_PATTERN.test(body));
}

// Deliberately a closed list of UNAMBIGUOUS shell no-ops. A hand-written always-succeeding program
// (`node -e "process.exit(0)"`, a custom script that returns 0) is indistinguishable from a small
// real wrapper without executing it, so static detection stops here — see the spec's Open Risks.
/** @purpose A command segment that cannot fail and checks nothing: `echo …`, `true`, `:`, `exit 0`, empty `node -e ""`, a bare `npm run` hop. */
const NO_OP_SEGMENT =
  /^(?:echo\b|true$|:$|exit\s+0$|node\s+-e\s+(['"])\s*\1$|npm run [A-Za-z0-9:_-]+$)/;

/**
 * @purpose Split a script body into its top-level command segments and the separators between them.
 * @invariant `|` and newlines separate commands too — `echo v | xargs tsc` is a real check, and a
 *   multi-line body is not one `echo`.
 * @param body One `package.json` script body.
 * @returns Trimmed non-empty segments, and the separator that preceded each (`''` for the first).
 */
function commandSegments(body: string): { cmd: string; sep: string }[] {
  const parts = body.split(/(&&|\|\||\||;|\n)/);
  const out: { cmd: string; sep: string }[] = [];
  let sep = '';
  for (const part of parts) {
    if (part === '&&' || part === '||' || part === '|' || part === ';' || part === '\n') {
      sep = part === '\n' ? ';' : part;
      continue;
    }
    const cmd = part.trim();
    if (cmd !== '') out.push({ cmd, sep });
  }
  return out;
}

/**
 * @purpose Detect a stub — every command `entry` reaches is a shell no-op, so it exits 0 verifying
 * nothing.
 * @invariant A body with even one real command segment (e.g. `echo hi && tsc`) is NOT a stub.
 * @param scripts The package.json scripts map.
 * @param entry The script name to check.
 * @returns True when `entry` exists and is no-op-only all the way down.
 */
export function isStubScript(scripts: Record<string, string>, entry: string): boolean {
  const bodies = reachableScriptBodies(scripts, entry);
  if (bodies.length === 0) return false;
  return bodies.every((body) => commandSegments(body).every(({ cmd }) => NO_OP_SEGMENT.test(cmd)));
}

// Masking requires a FALLBACK that runs BECAUSE the real command failed, with nothing real left to
// fail afterwards — `tsc || true`, `tsc; true`, `tsc || true && echo done`. An `&&` tail is never a
// mask: it is skipped when the command before it fails, so the failure still propagates
// (`tsc && npm run type-check:test`, `gennady lint && echo ok` are ordinary honest chains). And a
// real command AFTER the fallback re-exposes failure (`rm -rf dist || true && tsc --noEmit`).
// Getting this wrong in the permissive direction misses an exotic fake; getting it wrong in the
// strict direction pins an honest project at `provisional` forever, with no override anywhere.
/**
 * @purpose Detect an exit-code silencer — a real command whose failure a no-op fallback swallows.
 * @invariant Worse than a stub: it looks like a real tool and can never report red.
 * @param scripts The package.json scripts map.
 * @param entry The script name to check.
 * @returns True when `entry` or a script it reaches masks a real command's non-zero exit.
 */
export function silencesExitCode(scripts: Record<string, string>, entry: string): boolean {
  return reachableScriptBodies(scripts, entry).some((body) => {
    const segments = commandSegments(body);
    // `set -e` / `set -o errexit` aborts the script on an unguarded failure, so a `;`-separated no-op
    // after it never runs when the real command fails — only an explicit `||` catch still masks.
    // (`set -e` does NOT catch a pipe's non-final failure, so `|` masking is left as-is.)
    const errexitAt = segments.findIndex((s) => /^set\s+(?:-o\s+errexit\b|-[a-z]*e)/.test(s.cmd));
    return segments.some((seg, i) => {
      if (!NO_OP_SEGMENT.test(seg.cmd)) return false;
      const errexitGuards = errexitAt !== -1 && errexitAt < i;
      const isFallback =
        seg.sep === '||' || (!errexitGuards && (seg.sep === ';' || seg.sep === '|'));
      if (!isFallback) return false;
      const someRealBefore = segments.slice(0, i).some(({ cmd }) => !NO_OP_SEGMENT.test(cmd));
      const someRealAfter = segments.slice(i + 1).some(({ cmd }) => !NO_OP_SEGMENT.test(cmd));
      return someRealBefore && !someRealAfter;
    });
  });
}

/**
 * @purpose Whether a declared script can never report a real failure — a no-op stub, or a real
 * command with its exit code silenced.
 * @param scripts The package.json scripts map.
 * @param entry The script name to check.
 * @returns True when a green result from `entry` proves nothing.
 */
export function isVacuousScript(scripts: Record<string, string>, entry: string): boolean {
  return isStubScript(scripts, entry) || silencesExitCode(scripts, entry);
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
 * @invariant Exact-name match only; `lint` reaches gennady; `format`/`lint` read-only; `check`, if
 * present, read-only too; `format:fix`/`lint:fix` mutate; gennady installed; package.json present.
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
  const formatReadOnly = isScriptReadOnly(scripts, 'format');
  const lintReadOnly = isScriptReadOnly(scripts, 'lint');
  const checkReadOnly = isScriptReadOnly(scripts, 'check');
  const formatFixMutates = isScriptMutating(scripts, 'format:fix');
  const lintFixMutates = isScriptMutating(scripts, 'lint:fix');

  const missing: string[] = [];
  if (!packageJsonPresent) missing.push('package.json');
  missing.push(...required.filter((r) => !r.present).map((r) => r.name));
  if (scripts['lint'] !== undefined && !lintHasGennady) missing.push('lint→gennady');
  if (scripts['format'] !== undefined && !formatReadOnly) missing.push('format(read-only)');
  if (scripts['lint'] !== undefined && !lintReadOnly) missing.push('lint(read-only)');
  if (scripts['check'] !== undefined && !checkReadOnly) missing.push('check(read-only)');
  if (scripts['format:fix'] !== undefined && !formatFixMutates)
    missing.push('format:fix(no --write/--fix/--autofix — a fixer that never mutates)');
  if (scripts['lint:fix'] !== undefined && !lintFixMutates)
    missing.push('lint:fix(no --write/--fix/--autofix — a fixer that never mutates)');
  if (!gennadyAvailable) missing.push('gennady (not installed)');

  const ready =
    packageJsonPresent &&
    required.every((r) => r.present) &&
    lintHasGennady &&
    formatReadOnly &&
    lintReadOnly &&
    (scripts['check'] === undefined || checkReadOnly) &&
    formatFixMutates &&
    lintFixMutates &&
    gennadyAvailable;

  // Judged on the alias actually declared, but reported under the canonical name.
  const stubbed = REQUIRED_SCRIPTS.filter((name) =>
    (SCRIPT_ALIASES[name] ?? [name]).some(
      (n) => isRealScript(scripts[n]) && isVacuousScript(scripts, n)
    )
  );

  const level: ReadinessLevel = !ready ? 'not-ready' : stubbed.length > 0 ? 'provisional' : 'ready';

  return {
    packageJsonPresent,
    required,
    lintHasGennady,
    formatReadOnly,
    lintReadOnly,
    checkReadOnly,
    formatFixMutates,
    lintFixMutates,
    gennadyAvailable,
    ready,
    missing,
    stubbed,
    level,
    executionReady: level === 'ready',
  };
}

/**
 * @purpose Detect whether the gennady CLI is available — installed as a dependency, or the project
 * IS gennady (self-hosting runs its own source).
 * @param root Absolute project root.
 * @returns True when `<root>/node_modules/.bin/gennady` exists, or package.json `name` is `gennady`.
 */
function detectGennady(root: string): boolean {
  try {
    statSync(join(root, 'node_modules', '.bin', 'gennady'));
    return true;
  } catch {
    // fall through to the self-hosting check
  }
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    return pkg.name === 'gennady';
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
