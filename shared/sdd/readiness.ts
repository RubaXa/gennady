// @file: Exact-match readiness check for the required v2 npm scripts — pure check, plus the one
// disk-gathering helper every caller needs to build its input (no name-guessing).
// @consumers: sdd-state.cmd, sdd-task.cmd
// @tasks: N/A

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @purpose Exact npm scripts a v2-ready project declares: repair leaves, their public `fix`
 * entrypoint, and read-only foundation/quality gates. Human `check` remains optional.
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
  'fix',
] as const;

/**
 * @purpose Alternate spellings accepted for one required script; every other name has exactly one.
 * Canonical/displayed name stays `type-check`, even if the project spells it `typecheck`.
 */
const SCRIPT_ALIASES: Partial<Record<(typeof REQUIRED_SCRIPTS)[number], readonly string[]>> = {
  'type-check': ['type-check', 'typecheck'],
};

/** @purpose Resolve the exact declared project script a canonical verification gate executes. | @param scripts Project scripts map. | @param canonical Canonical gate/script name. | @returns Declared executable name, preferring the canonical spelling, or undefined. */
export function resolveProjectScriptName(
  scripts: Record<string, string>,
  canonical: string
): string | undefined {
  const aliases =
    canonical === 'type-check' ? (SCRIPT_ALIASES['type-check'] ?? ['type-check']) : [canonical];
  return aliases.find((name) => typeof scripts[name] === 'string' && scripts[name]!.trim() !== '');
}

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
 * gennady, read-only checks, mutating leaves, and gennady installed.
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
  /** @purpose Whether `format:fix` declares an argument-forwarding prefix with no obvious broad operand. */
  formatFixDeclaredTargetPrefix: boolean;
  /** @purpose Whether `lint:fix` declares an argument-forwarding prefix with no obvious broad operand. */
  lintFixDeclaredTargetPrefix: boolean;
  /** @purpose Whether canonical `fix` reaches both `format:fix` and `lint:fix`. */
  fixHasCanonicalRepairs: boolean;
  /** @purpose Whether the gennady CLI is installed for the project. */
  gennadyAvailable: boolean;
  /** @purpose True when the project is ready (package.json + all required present + gennady in lint + gennady installed). */
  ready: boolean;
  /** @purpose Human-readable list of what is missing (package.json, script names, `lint→gennady`, gennady install). */
  missing: string[];
  /** @purpose Required scripts present but vacuous — a no-op stub, or a real command with `|| true` swallowing its exit code; never in `missing`. */
  stubbed: string[];
  /** @purpose Canonical, de-duplicated gate aliases currently absent, vacuous, or structurally invalid, consumed by platform-neutral bootstrap ownership. */
  missingGates: string[];
  /** @purpose Refined verdict: `not-ready` / `provisional` (bootstrap/scaffold may proceed, code phases may not) / `ready` (execution may proceed). */
  level: ReadinessLevel;
  /** @purpose True only at `level === 'ready'` — the gate for impl/refactor/test phases; bootstrap phases need only `ready`. */
  executionReady: boolean;
};

/**
 * @purpose Strip shell line-comments so a switch hidden in one is not taken for a real one —
 *   `prettier --check . # --write` is read-only.
 * @invariant Only an unquoted ` #` (or a `#` at line start) opens a comment; a `#` glued to a token
 *   (`a#b`) is left alone.
 * @param body One package.json script body.
 * @returns The body with comments removed, line structure preserved.
 */
function stripShellComments(body: string): string {
  return body
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, '$1').trimEnd())
    .join('\n');
}

/**
 * @purpose The script this segment hops to — `npm run <name>` (or pnpm/yarn) IN COMMAND POSITION,
 *   after peeling `VAR=val` assignments.
 * @invariant A `npm run` inside quotes or an `echo` argument is not a hop — a placeholder naming
 *   another script stays a stub.
 * @param cmd One command segment.
 * @returns The hopped-to script name, or null when the segment is not a run-hop.
 */
function scriptHopTarget(cmd: string): string | null {
  const toks = cmd.trim().split(/\s+/);
  while (toks.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0] as string)) toks.shift();
  if (
    toks.length >= 3 &&
    /^(?:npm|pnpm|yarn)$/.test(toks[0] ?? '') &&
    toks[1] === 'run' &&
    /^[A-Za-z0-9:_-]+$/.test(toks[2] ?? '')
  ) {
    return toks[2] as string;
  }
  return null;
}

/** @purpose Runner wrappers whose first argument is the real command — peeled to find the head. */
const RUNNER_TOKEN = /^(?:npx|pnpm|yarn|bunx|tsx|ts-node|node)$/;

/**
 * @purpose True when a segment INVOKES gennady in COMMAND position — after peeling `VAR=val` and
 *   runner wrappers, the head is `gennady` or a `…/gennady.ts|.js` path.
 * @invariant `echo gennady` / `: gennady` (gennady as an argument) do NOT count; `tsx cli/gennady.ts`
 *   and `npx gennady` do.
 * @param cmd One command segment.
 * @returns Whether the segment runs gennady.
 */
function invokesGennady(cmd: string): boolean {
  const toks = cmd.trim().split(/\s+/);
  while (toks.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0] as string)) toks.shift();
  while (toks.length > 1 && RUNNER_TOKEN.test(toks[0] as string)) toks.shift();
  return /(?:^|\/)gennady(?:\.[jt]s)?$/.test(toks[0] ?? '');
}

/**
 * @purpose Resolve whether `lint` reaches a real gennady invocation, following run-hops deterministically.
 * @invariant Judged on comment-stripped, command-position tokens — a `# gennady` comment or an `echo gennady` argument does not count.
 * @param scripts The package.json scripts map.
 * @param entry Script name from which transitive run-hop traversal starts.
 * @returns True when gennady is reachable from the `lint` script.
 */
export function scriptReachesGennady(scripts: Record<string, string>, entry: string): boolean {
  const first = scripts[entry];
  if (first === undefined) return false;

  const seen = new Set<string>();
  const queue: string[] = [first];
  while (queue.length > 0) {
    const raw = queue.shift();
    if (raw === undefined) continue;
    const body = stripShellComments(raw);
    if (commandSegments(body).some((s) => invokesGennady(s.cmd))) return true;
    for (const seg of commandSegments(body)) {
      const ref = scriptHopTarget(seg.cmd);
      if (ref && !seen.has(ref) && scripts[ref] !== undefined) {
        seen.add(ref);
        queue.push(scripts[ref] as string);
      }
    }
  }
  return false;
}

/** @purpose Whether the canonical read-only lint script reaches the Gennady contract linter. */
function lintReachesGennady(scripts: Record<string, string>): boolean {
  return scriptReachesGennady(scripts, 'lint');
}

/**
 * @purpose Resolve a script's transitive run-hop bodies once, including the entry body, each
 *   comment-stripped so no downstream check sees a switch hidden in a comment.
 * @param scripts The package.json scripts map. | @param entry The script name.
 * @returns Comment-stripped bodies reachable from `entry`.
 */
function reachableScriptBodies(scripts: Record<string, string>, entry: string): string[] {
  const first = scripts[entry];
  if (first === undefined) return [];
  const bodies: string[] = [];
  const seen = new Set<string>([entry]);
  const queue = [first];
  while (queue.length > 0) {
    const raw = queue.shift();
    if (raw === undefined) continue;
    const body = stripShellComments(raw);
    bodies.push(body);
    for (const seg of commandSegments(body)) {
      const name = scriptHopTarget(seg.cmd);
      if (name && !seen.has(name) && scripts[name] !== undefined) {
        seen.add(name);
        queue.push(scripts[name]);
      }
    }
  }
  return bodies;
}

/**
 * @purpose Whether the canonical `fix` graph reaches formatter repair before lint repair.
 * @param scripts Package scripts map.
 * @returns True only when a depth-first execution-order walk encounters `format:fix`, then
 * `lint:fix`. Cycles are bounded by `seen`.
 */
function fixHasCanonicalRepairOrder(scripts: Record<string, string>): boolean {
  const seen = new Set<string>();
  const repairs: string[] = [];
  const visit = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    const body = scripts[name];
    if (body === undefined) return;
    for (const segment of commandSegments(stripShellComments(body))) {
      const next = scriptHopTarget(segment.cmd);
      if (next === 'format:fix' || next === 'lint:fix') repairs.push(next);
      else if (next !== null) visit(next);
    }
  };
  visit('fix');
  const formatIndex = repairs.indexOf('format:fix');
  const lintIndex = repairs.indexOf('lint:fix');
  return formatIndex >= 0 && lintIndex > formatIndex;
}

// `(?![\w-])` ends the flag exactly — so `--fix-dry-run` / `--writeable` are NOT the mutating flag,
// while `--fix`, `--fix `, `--fix=…` are. `--fix-dry-run` reads and reports, never mutates.
/** @purpose The known formatter/linter write switches forbidden in a read-only script graph. */
const WRITE_SWITCH_PATTERN =
  /(?:eslint\b[^&|;\n]*\s--fix(?![\w-])|prettier\b[^&|;\n]*\s--write(?![\w-])|\s--autofix(?![\w-]))/;

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

/** @purpose Any of the three mutating switches a fixer script must carry — exact flag, so `--fix-dry-run` (a read-only dry run) does NOT qualify. */
const MUTATING_SWITCH_PATTERN = /\s--(?:write|fix|autofix)(?![\w-])/;

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

/**
 * @purpose Check the declared argument-forwarding repair shape without pretending to prove its write set.
 * @invariant One command ends in its write switch and contains no broad target, shell chain, or
 *   opaque `npm run` hop.
 * @param scripts Project package scripts.
 * @param entry Repair brick name.
 * @returns True for a declared prefix with no obvious broad target/glob or shell indirection.
 */
export function isDeclaredArgumentForwardingRepairBrick(
  scripts: Record<string, string>,
  entry: string
): boolean {
  const raw = scripts[entry];
  if (raw === undefined) return false;
  const segments = commandSegments(stripShellComments(raw));
  if (segments.length !== 1) return false;
  const command = segments[0]?.cmd.trim() ?? '';
  if (scriptHopTarget(command)) return false;
  const tokens = command.split(/\s+/);
  if (!/^--(?:write|fix|autofix)$/.test(tokens.at(-1) ?? '')) return false;
  // A broad operand is unsafe even when authors put it before the write switch (`tool . --write`).
  // Keep this lexical and tool-agnostic: exact tool syntax is intentionally not inferred here.
  const bakedBroadTarget = tokens
    .slice(0, -1)
    .some((token) => /^(?:\.|\.\/)$/.test(token) || /\/$/.test(token) || /[*?\[]/.test(token));
  return !bakedBroadTarget;
}

// Deliberately a closed list of UNAMBIGUOUS shell no-ops. A hand-written always-succeeding program
// (`node -e "process.exit(0)"`, a custom script that returns 0) is indistinguishable from a small
// real wrapper without executing it, so static detection stops here — see the spec's Open Risks.
/** @purpose A command segment that cannot fail and checks nothing: `echo …`, `true`, `:`, `exit 0`, empty `node -e ""`, a bare `npm run` hop. */
const NO_OP_SEGMENT =
  /^(?:echo\b|true$|:$|exit\s+0$|node\s+-e\s+(['"])\s*\1$|npm run [A-Za-z0-9:_-]+$)/;

/**
 * @purpose Split a body into TOP-LEVEL segments + separators, quote- and `(...)`/`{...}`-aware so an
 *   operator inside a subshell or quote is not a split point.
 * @invariant `|`, `;` and newlines separate too; `tsc || (echo x && true)` keeps the subshell as
 *   ONE segment.
 * @param body One `package.json` script body.
 * @returns Trimmed non-empty segments, and the operator that preceded each (`''` for the first; `\n`
 *   is normalized to `;`).
 */
function commandSegments(body: string): { cmd: string; sep: string }[] {
  const out: { cmd: string; sep: string }[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  let sep = '';
  const push = (): void => {
    const cmd = cur.trim();
    if (cmd !== '') out.push({ cmd, sep });
    cur = '';
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (quote) {
      cur += c;
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '(' || c === '{') depth++;
    else if (c === ')' || c === '}') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const two = body.slice(i, i + 2);
      if (two === '&&' || two === '||') {
        push();
        sep = two;
        i++;
        continue;
      }
      if (c === '|' || c === ';' || c === '\n') {
        push();
        sep = c === '\n' ? ';' : c;
        continue;
      }
    }
    cur += c;
  }
  push();
  return out;
}

/**
 * @purpose Whether a segment is a no-op — a bare no-op token, or a subshell/brace-group whose inner
 *   commands are all no-ops (`(echo x && true)`).
 * @param cmd One command segment.
 * @returns True when the segment cannot fail and checks nothing.
 */
function isNoOp(cmd: string): boolean {
  const group = cmd.match(/^[({]\s*([\s\S]*?)\s*[)}]$/);
  if (group && group[1] !== undefined) {
    return commandSegments(group[1]).every((s) => isNoOp(s.cmd));
  }
  return NO_OP_SEGMENT.test(cmd);
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
  return bodies.every((body) => commandSegments(body).every(({ cmd }) => isNoOp(cmd)));
}

/**
// Scope is DELIBERATELY narrow — the echo-stubs the readiness directive prescribes at bootstrap, NOT
// adversarially-crafted exit-code masks (`tsc || true`, `tsc | cat`). We are not in a hostile
// environment; a deliberately silenced exit code is the author's own choice, and the real net for
// genuine fictitiousness is the audit + real-toolchain e2e (observed behaviour), never a shell
// heuristic. Best-effort: a green here means "not an obvious stub", not "the gate is proven real".
/**
 * @purpose Whether a green result from `entry` proves nothing — a classic bootstrap placeholder
 *   (echo/`:`/`true`/empty) standing in for a real tool.
 * @invariant Narrow by design — bootstrap echo-stubs only, not crafted exit-code masks (see above).
 * @param scripts The package.json scripts map.
 * @param entry The script name to check.
 * @returns True when `entry` is a no-op-only stub all the way down.
 */
export function isVacuousScript(scripts: Record<string, string>, entry: string): boolean {
  return isStubScript(scripts, entry);
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
 * present, read-only too; repair leaves mutate; `fix` reaches both leaves; gennady installed.
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
  const formatFixDeclaredTargetPrefix = isDeclaredArgumentForwardingRepairBrick(
    scripts,
    'format:fix'
  );
  const lintFixDeclaredTargetPrefix = isDeclaredArgumentForwardingRepairBrick(scripts, 'lint:fix');
  const fixHasCanonicalRepairs = fixHasCanonicalRepairOrder(scripts);

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
  if (
    scripts['format:fix'] !== undefined &&
    !isStubScript(scripts, 'format:fix') &&
    !formatFixDeclaredTargetPrefix
  )
    missing.push(
      'format:fix(must declare an argument-forwarding prefix with no obvious broad root/glob; runtime phase repair verifies actual writes)'
    );
  if (
    scripts['lint:fix'] !== undefined &&
    !isStubScript(scripts, 'lint:fix') &&
    !lintFixDeclaredTargetPrefix
  )
    missing.push(
      'lint:fix(must declare an argument-forwarding prefix with no obvious broad root/glob; runtime phase repair verifies actual writes)'
    );
  if (scripts['fix'] !== undefined && !fixHasCanonicalRepairs)
    missing.push('fix(must run format:fix then lint:fix)');
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
    (isStubScript(scripts, 'format:fix') || formatFixDeclaredTargetPrefix) &&
    (isStubScript(scripts, 'lint:fix') || lintFixDeclaredTargetPrefix) &&
    fixHasCanonicalRepairs &&
    gennadyAvailable;

  // Judged on the alias actually declared, but reported under the canonical name.
  const stubbed = REQUIRED_SCRIPTS.filter((name) =>
    (SCRIPT_ALIASES[name] ?? [name]).some(
      (n) => isRealScript(scripts[n]) && isVacuousScript(scripts, n)
    )
  );

  const level: ReadinessLevel = !ready ? 'not-ready' : stubbed.length > 0 ? 'provisional' : 'ready';
  const missingGates = [
    ...(!packageJsonPresent ? ['package.json'] : []),
    ...required.filter((item) => !item.present).map((item) => item.name),
    ...stubbed,
    ...(!lintHasGennady && scripts['lint'] !== undefined ? ['lint'] : []),
    ...(!formatReadOnly && scripts['format'] !== undefined ? ['format'] : []),
    ...(!lintReadOnly && scripts['lint'] !== undefined ? ['lint'] : []),
    ...(!checkReadOnly && scripts['check'] !== undefined ? ['check'] : []),
    ...(!formatFixMutates && scripts['format:fix'] !== undefined ? ['format:fix'] : []),
    ...(!formatFixDeclaredTargetPrefix &&
    scripts['format:fix'] !== undefined &&
    !isStubScript(scripts, 'format:fix')
      ? ['format:fix']
      : []),
    ...(!lintFixMutates && scripts['lint:fix'] !== undefined ? ['lint:fix'] : []),
    ...(!lintFixDeclaredTargetPrefix &&
    scripts['lint:fix'] !== undefined &&
    !isStubScript(scripts, 'lint:fix')
      ? ['lint:fix']
      : []),
    ...(!fixHasCanonicalRepairs && scripts['fix'] !== undefined ? ['fix'] : []),
    ...(!gennadyAvailable ? ['gennady'] : []),
  ].filter((gate, index, gates) => gates.indexOf(gate) === index);

  return {
    packageJsonPresent,
    required,
    lintHasGennady,
    formatReadOnly,
    lintReadOnly,
    checkReadOnly,
    formatFixMutates,
    lintFixMutates,
    formatFixDeclaredTargetPrefix,
    lintFixDeclaredTargetPrefix,
    fixHasCanonicalRepairs,
    gennadyAvailable,
    ready,
    missing,
    stubbed,
    missingGates,
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
