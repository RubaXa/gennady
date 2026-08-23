// @file: Gates, types, and verdict for sdd-verify — fixed exact gates, brief success, details only on failure.
// @consumers: SddVerifyCommand
// @tasks: N/A

import { parseArgs } from '../../../shared/common/parse-args.ts';

/** @purpose CLI invocation carried an extra positional path, or a flag other than `--profile` — sdd-verify never silently narrows or ignores. */
export const ERR_CLI_SDD_VERIFY_BAD_INVOCATION = 'ERR_CLI_SDD_VERIFY_BAD_INVOCATION' as const;

/**
 * @purpose A verification gate — an exact project npm script, or a gennady-native check called directly.
 * @invariant `via: 'gennady'` gates never require a matching project npm script — `readiness.ts`
 *   REQUIRED_SCRIPTS omits `yagni` for this reason.
 */
export type Gate = {
  /** @purpose Exact npm script name (`via: 'npm'`) or gennady subcommand name (`via: 'gennady'`). */
  name: string;
  /** @purpose True when the gate rewrites files (format / lint autofix) — keeps it ahead of read-only gates. */
  mutates: boolean;
  /** @purpose `'npm'` runs `npm run <name>` (default); `'gennady'` runs `npx gennady <name>` directly. */
  via?: 'npm' | 'gennady';
};

/**
 * @purpose The canonical verification sequence — mutating gates first (they rewrite files), then read-only. Profiles subset this list, preserving order.
 * @invariant Order normative: format → lint → typecheck → test:coverage → yagni; autofix never
 *   races a reader. `yagni` is `via: 'gennady'` (D-SV008).
 */
export const GATES: readonly Gate[] = [
  { name: 'format', mutates: true },
  { name: 'lint', mutates: true },
  { name: 'type-check', mutates: false },
  { name: 'test:coverage', mutates: false },
  { name: 'yagni', mutates: false, via: 'gennady' },
];

/** @purpose Gate profile by phase kind — fixed sets chosen by an explicit flag (not detection); `full` is the safe default. */
export type Profile = 'code' | 'test' | 'full';

// Gate names per profile: code skips tests (may not exist yet) but still runs yagni (a code-diff
// concern, not a test concern); test skips lint + yagni (no production code changed); full runs everything.
const PROFILE_GATES: Record<Profile, readonly string[]> = {
  code: ['format', 'lint', 'type-check', 'yagni'],
  test: ['format', 'type-check', 'test:coverage'],
  full: ['format', 'lint', 'type-check', 'test:coverage', 'yagni'],
};

/**
 * @purpose The gates for a profile, in canonical GATES order.
 * @param profile Selected profile.
 * @returns Filtered, ordered gate list.
 */
export function gatesFor(profile: Profile): readonly Gate[] {
  const names = PROFILE_GATES[profile];
  return GATES.filter((g) => names.includes(g.name));
}

/**
 * @purpose Type guard for a profile token from CLI input.
 * @param v Raw arg value.
 * @returns True when v is a known profile.
 */
export function isProfile(v: string): v is Profile {
  return v === 'code' || v === 'test' || v === 'full';
}

/**
 * @purpose Build the bad-invocation diagnostic — tool-teaches: names the problem and the exact
 *   alternative for "check only my own files".
 * @param detail What was wrong with the invocation.
 * @returns The full multi-line message, ready to print (exit code 4).
 */
function badInvocationMessage(detail: string): string {
  return [
    `[verify] ${ERR_CLI_SDD_VERIFY_BAD_INVOCATION}: ${detail}`,
    '  sdd-verify always runs its fixed gate profile over the WHOLE project — it takes no path',
    '  arguments, and no flag besides --profile. A path here does not narrow the run; it is rejected,',
    '  never silently ignored.',
    '  To check only your own files, run: npx gennady lint --spec=<module-spec> <paths>',
    '  usage: npx gennady sdd-verify [--profile <code|test|full>]',
  ].join('\n');
}

/** @purpose Outcome of parsing sdd-verify's CLI invocation. */
export type InvocationResult = { ok: true; profile: Profile } | { ok: false; message: string };

/**
 * @purpose Parse sdd-verify's CLI invocation strictly: only `--profile <code|test|full>` is
 *   accepted, no positional argument. An extra path or bad flag is a hard, teaching error.
 * @param argv Full `process.argv` — the shape `parseArgs` expects.
 * @returns The resolved profile, or a ready-to-print bad-invocation message (exit code 4).
 */
export function parseInvocation(argv: string[]): InvocationResult {
  let parsed: Record<string, unknown> & { _: string[] };
  try {
    parsed = parseArgs(
      argv,
      { profile: { aliases: ['profile'], takesValue: true } },
      { strict: true }
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, message: badInvocationMessage(detail) };
  }

  // parseArgs keeps the command token itself (argv[2], e.g. "sdd-verify") in `_` alongside any
  // real positional — drop it before judging whether the caller passed an actual extra argument.
  const positional = parsed._.slice(1);
  if (positional.length > 0) {
    return {
      ok: false,
      message: badInvocationMessage(`unexpected path argument(s): ${positional.join(' ')}`),
    };
  }

  const rawProfile = typeof parsed.profile === 'string' ? parsed.profile : 'full';
  if (!isProfile(rawProfile)) {
    return {
      ok: false,
      message: badInvocationMessage(
        `unknown --profile '${rawProfile}' (expected: code | test | full)`
      ),
    };
  }
  return { ok: true, profile: rawProfile };
}

/** @purpose Outcome of running one command — exit code + combined output. */
export type GateRunResult = {
  /** @purpose Process exit code; 0 is pass. */
  exitCode: number;
  /** @purpose Combined stdout + stderr. */
  output: string;
};

/** @purpose Runs one gate command and returns its result — injectable for tests. */
export type GateRunner = (command: string, args: string[]) => GateRunResult;

/** @purpose A gate's run result with wall-clock timing. */
export type GateResult = {
  /** @purpose Gate name. */
  name: string;
  /** @purpose Exit code; 0 is pass. */
  exitCode: number;
  /** @purpose Combined output — shown only when the gate fails. */
  output: string;
  /** @purpose Wall-clock duration in milliseconds. */
  durationMs: number;
  /** @purpose The command actually run — surfaced on failure so nothing has to be guessed. */
  ranCommand: string;
};

/**
 * @purpose Result of one sdd-verify run.
 * @invariant On failure `message` is never empty and lists only the failed gates' output; exit is always 1.
 */
export type VerifyOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1; message: string };

/** @purpose Render a duration in seconds with one decimal. | @param ms Milliseconds. | @returns A `<n>s` label. */
function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** @purpose Tail-cap ceiling: at most this many trailing lines are kept from a failed gate's output. */
const TAIL_CAP_LINES = 120;
/** @purpose Tail-cap ceiling: at most this many bytes are kept — whichever of the two limits is stricter wins. */
const TAIL_CAP_BYTES = 16 * 1024;

/**
 * @purpose Cap a failed gate's output to its last N lines or 16KB, whichever is smaller — a runaway gate must not flood context.
 * @param output Raw combined stdout+stderr of the failed gate.
 * @param ranCommand The command actually run, for the truncation note's replay hint.
 * @returns The output untouched when it already fits both bounds; otherwise the kept tail prefixed with a one-line truncation note.
 */
function tailCap(output: string, ranCommand: string): string {
  const trimmed = output.trimEnd();
  let lines = trimmed.split('\n');
  let truncated = false;

  if (lines.length > TAIL_CAP_LINES) {
    lines = lines.slice(-TAIL_CAP_LINES);
    truncated = true;
  }
  while (lines.length > 1 && Buffer.byteLength(lines.join('\n'), 'utf-8') > TAIL_CAP_BYTES) {
    lines = lines.slice(1);
    truncated = true;
  }

  if (!truncated) return trimmed;
  return [
    `… output truncated to last ${lines.length} lines — full transcript: ${ranCommand}`,
    lines.join('\n'),
  ].join('\n');
}

/**
 * @purpose Reduce gate results to a verdict — brief on success, detailed only for failed gates.
 * @invariant Passing gates emit one `✅ <name> (<dur>)` line; a failed gate adds its captured output.
 * @param results Gate results in run order.
 * @returns ok with the ✅ summary, or a failure with each failed gate's exit + output.
 */
export function verdict(results: GateResult[]): VerifyOutcome {
  const failed = results.filter((r) => r.exitCode !== 0);
  const passLines = results
    .filter((r) => r.exitCode === 0)
    .map((r) => `  ✅ ${r.name} (${secs(r.durationMs)})`);

  if (failed.length === 0) {
    return {
      ok: true,
      text: [`[verify] ✅ ALL PASS (${results.length}/${results.length})`, ...passLines].join('\n'),
    };
  }

  const failBlocks = failed.map((r) =>
    [
      `  ❌ ${r.name} — exit ${r.exitCode} (ran: ${r.ranCommand})`,
      '  --- output ---',
      tailCap(r.output, r.ranCommand),
      '  --- end ---',
    ].join('\n')
  );
  return {
    ok: false,
    code: 'ERR_CLI_SDD_VERIFY_GATE_FAILED',
    exitCode: 1,
    message: [
      `[verify] ${results.length - failed.length}/${results.length} passed — ${failed.length} FAILED`,
      ...passLines,
      ...failBlocks,
    ].join('\n'),
  };
}
