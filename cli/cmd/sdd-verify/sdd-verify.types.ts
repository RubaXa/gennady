// @file: Gates, types, and verdict for sdd-verify — fixed exact gates, brief success, details only on failure.
// @consumers: SddVerifyCommand
// @tasks: N/A

/** @purpose A verification gate — an exact npm script plus whether it rewrites files. */
export type Gate = {
  /** @purpose Exact npm script name, run as `npm run <name>`. */
  name: string;
  /** @purpose True when the gate rewrites files (format / lint autofix) — keeps it ahead of read-only gates. */
  mutates: boolean;
};

/**
 * @purpose The canonical verification sequence — mutating gates first (they rewrite files), then read-only. Profiles subset this list, preserving order.
 * @invariant Order is normative: format → lint (both autofix) → typecheck → test:coverage. Run sequentially so autofix never races a reader.
 */
export const GATES: readonly Gate[] = [
  { name: 'format', mutates: true },
  { name: 'lint', mutates: true },
  { name: 'typecheck', mutates: false },
  { name: 'test:coverage', mutates: false },
];

/** @purpose Gate profile by phase kind — fixed sets chosen by an explicit flag (not detection); `full` is the safe default. */
export type Profile = 'code' | 'test' | 'full';

// Gate names per profile: code skips tests (may not exist yet), test skips lint, full runs everything.
const PROFILE_GATES: Record<Profile, readonly string[]> = {
  code: ['format', 'lint', 'typecheck'],
  test: ['format', 'typecheck', 'test:coverage'],
  full: ['format', 'lint', 'typecheck', 'test:coverage'],
};

/** @purpose The gates for a profile, in canonical GATES order. | @param profile Selected profile. | @returns Filtered, ordered gate list. */
export function gatesFor(profile: Profile): readonly Gate[] {
  const names = PROFILE_GATES[profile];
  return GATES.filter((g) => names.includes(g.name));
}

/** @purpose Type guard for a profile token from CLI input. | @param v Raw arg value. | @returns True when v is a known profile. */
export function isProfile(v: string): v is Profile {
  return v === 'code' || v === 'test' || v === 'full';
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
    [`  ❌ ${r.name} — exit ${r.exitCode}`, '  --- output ---', r.output.trimEnd(), '  --- end ---'].join('\n')
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
