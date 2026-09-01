// @file: Gates, types, and verdict for sdd-verify — repair-first phase profiles and a read-only
//   full profile, each with a fixed order and fail-closed required gates.
// @consumers: SddVerifyCommand
// @tasks: N/A

import { parseArgs } from '../../../shared/common/parse-args.ts';
import {
  requiredVerificationGateNames,
  verificationGateNames,
  type VerificationProfile,
} from '../../../shared/sdd/phase-verification-plan.ts';

/** @purpose CLI invocation carried an extra positional path, or a flag other than `--profile` — sdd-verify never silently narrows or ignores. */
export const ERR_CLI_SDD_VERIFY_BAD_INVOCATION = 'ERR_CLI_SDD_VERIFY_BAD_INVOCATION' as const;

/**
 * @purpose One rung of the verification ladder — an exact project npm script, or a gennady-native
 *   check called directly.
 * @invariant Repair and foundation gates halt on failure; only `fix` mutates.
 */
export type Gate = {
  /** @purpose Exact npm script name (`via: 'npm'`) or gennady subcommand name (`via: 'gennady'`). */
  name: string;
  /** @purpose True only for the exact-target phase repair rung (`fix`). */
  mutates: boolean;
  /** @purpose Whether failure stops the ladder; true for repair and foundation rungs. */
  haltsOnFailure: boolean;
  /** @purpose Dispatch: project npm script, gennady-native command, or exact-target phase repair. */
  via?: 'npm' | 'gennady' | 'target-repair';
};

/**
 * @purpose Canonical gate registry. Profiles select a fixed repair-first or read-only sequence.
 * @invariant Phase order is `fix` then foundation; full is read-only foundation then quality.
 */
export const GATES: readonly Gate[] = [
  { name: 'fix', mutates: true, haltsOnFailure: true, via: 'target-repair' },
  { name: 'type-check', mutates: false, haltsOnFailure: true },
  { name: 'test', mutates: false, haltsOnFailure: true },
  { name: 'test:coverage', mutates: false, haltsOnFailure: true },
  { name: 'lint', mutates: false, haltsOnFailure: false },
  { name: 'format', mutates: false, haltsOnFailure: false },
  { name: 'yagni', mutates: false, haltsOnFailure: false, via: 'gennady' },
];

/** @purpose Gate profile — phase sets derive from ticket kind; only global `full` is selected explicitly. */
export type Profile = VerificationProfile;

/**
 * @purpose The gates for a profile, in canonical GATES order.
 * @param profile Selected profile.
 * @param [producesCoverage] Whether a test phase owns the producer; ignored by other profiles.
 * @returns Filtered, ordered gate list.
 */
export function gatesFor(profile: Profile, producesCoverage = profile === 'test'): readonly Gate[] {
  const names = verificationGateNames(profile, producesCoverage);
  return GATES.filter((g) => names.includes(g.name));
}

/**
 * @purpose Required names for the exact selected ladder; setup alone may skip bootstrap gaps.
 * @param profile Selected profile.
 * @param [producesCoverage] Whether a test phase owns the producer; ignored by other profiles.
 * @returns Required gate names in ladder order.
 */
export function requiredGatesFor(
  profile: Profile,
  producesCoverage = profile === 'test'
): readonly string[] {
  return requiredVerificationGateNames(profile, producesCoverage);
}

/**
 * @purpose Type guard for a profile token from CLI input.
 * @param v Raw arg value.
 * @returns True when v is a known profile.
 */
export function isProfile(v: string): v is Profile {
  return v === 'setup' || v === 'code' || v === 'test' || v === 'full';
}

/**
 * @purpose Build the bad-invocation diagnostic — tool-teaches: names the problem and the exact
 *   alternative for "check only my own files".
 * @param detail What was wrong with the invocation.
 * @returns The full multi-line message, ready to print (exit code 4).
 */
function badInvocationMessage(detail: string): string {
  return [
    `[sdd-verify] ${ERR_CLI_SDD_VERIFY_BAD_INVOCATION}: ${detail}`,
    '  Phase verification reads kind, Target Files, and owning spec from the ticket.',
    '  usage: npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>',
    '         npx gennady sdd-verify --profile full',
  ].join('\n');
}

/** @purpose Strict CLI shape: a phase context, or the global read-only full gate. */
export type InvocationResult =
  | { ok: true; mode: 'full'; profile: 'full' }
  | { ok: true; mode: 'phase'; task: string; phase: string }
  | { ok: false; message: string };

/**
 * @purpose Parse sdd-verify strictly: phase context, or the explicit global full profile.
 * @param argv Full `process.argv` — the shape `parseArgs` expects.
 * @returns Structural phase identity, global full, or a ready-to-print bad-invocation message (exit code 4).
 */
export function parseInvocation(argv: string[]): InvocationResult {
  let parsed: Record<string, unknown> & { _: string[] };
  try {
    parsed = parseArgs(
      argv,
      {
        profile: { aliases: ['profile'], takesValue: true },
        task: { aliases: ['task'], takesValue: true },
        phase: { aliases: ['phase'], takesValue: true },
      },
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

  const scalar = (
    key: 'profile' | 'task' | 'phase'
  ): { ok: true; value?: string } | { ok: false; message: string } => {
    const raw = parsed[key];
    if (raw === undefined) return { ok: true };
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return {
        ok: false,
        message: badInvocationMessage(`--${key} requires exactly one non-empty value`),
      };
    }
    return { ok: true, value: raw };
  };
  const profileValue = scalar('profile');
  if (!profileValue.ok) return profileValue;
  const taskValue = scalar('task');
  if (!taskValue.ok) return taskValue;
  const phaseValue = scalar('phase');
  if (!phaseValue.ok) return phaseValue;
  const rawProfile = profileValue.value;
  const task = taskValue.value;
  const phase = phaseValue.value;
  if (rawProfile !== undefined && rawProfile !== 'full') {
    return {
      ok: false,
      message: badInvocationMessage(
        `only '--profile full' is public; phase profiles are derived from --task/--phase (got '${rawProfile}')`
      ),
    };
  }
  if (rawProfile === 'full') {
    if (task || phase) {
      return {
        ok: false,
        message: badInvocationMessage("'--profile full' cannot be combined with --task/--phase"),
      };
    }
    return { ok: true, mode: 'full', profile: 'full' };
  }
  if (!task && !phase) return { ok: true, mode: 'full', profile: 'full' };
  if (!task || !phase) {
    return {
      ok: false,
      message: badInvocationMessage(
        'phase verification requires both --task <ticket-path> and --phase <PhaseID>'
      ),
    };
  }
  return { ok: true, mode: 'phase', task, phase };
}

/** @purpose Outcome of running one command — exit code + combined output. */
export type GateRunResult = {
  /** @purpose Process exit code; 0 is pass. */
  exitCode: number;
  /** @purpose Combined stdout + stderr. */
  output: string;
};

/** @purpose Runs one gate command and returns its result — sync fakes and async production runners are both injectable. */
export type GateRunner = (
  command: string,
  args: string[]
) => GateRunResult | Promise<GateRunResult>;

/** @purpose Rung outcome: ran and passed, ran and failed, honestly skipped (optional script absent), or `missing` — a REQUIRED script that is absent or stubbed. */
export type GateStatus = 'pass' | 'fail' | 'skipped' | 'missing';

/** @purpose A gate's run result with wall-clock timing. */
export type GateResult = {
  /** @purpose Gate name. */
  name: string;
  /** @purpose `'skipped'` when the project declares no matching npm script — never an error. */
  status: GateStatus;
  /** @purpose Exit code; 0 is pass, 0 also for a skipped rung (it never ran). */
  exitCode: number;
  /** @purpose Combined output — shown only when the gate fails. */
  output: string;
  /** @purpose Wall-clock duration in milliseconds; 0 for a skipped rung. */
  durationMs: number;
  /** @purpose The command actually run — surfaced on failure so nothing has to be guessed. */
  ranCommand: string;
  /** @purpose Carried from `Gate.mutates`; the phase repair rung is mutating. */
  mutates: boolean;
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
/** @purpose Cap on the `not ok` digest lines recovered from the truncated part of a failed gate's output. */
const FAILURE_DIGEST_LINES = 10;
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

  // A TAP run prints failures mid-stream and its summary at the end — a plain tail keeps the
  // summary but can drop every `not ok` line, leaving no clue WHICH test failed. Digest them.
  const kept = new Set(lines);
  const droppedFailures = trimmed
    .split('\n')
    .filter((l) => /^\s*not ok /.test(l) && !kept.has(l))
    .slice(0, FAILURE_DIGEST_LINES);

  return [
    `… output truncated to last ${lines.length} lines — full transcript: ${ranCommand}`,
    ...(droppedFailures.length > 0
      ? [
          `  failing tests dropped by the cap (first ${droppedFailures.length}):`,
          ...droppedFailures,
        ]
      : []),
    lines.join('\n'),
  ].join('\n');
}

/**
 * @purpose Render one non-failing rung's summary line — passed check, passed repair, or skipped.
 * @param r The rung's result.
 * @returns A single `  <marker> <name> …` line.
 */
function lineFor(r: GateResult): string {
  if (r.status === 'skipped') {
    return `  ⏭ ${r.name} — скрипта нет в package.json, пропущено`;
  }
  const marker = r.mutates ? '🔧' : '✅';
  const note = r.mutates ? ' — мутирующий шаг' : '';
  return `  ${marker} ${r.name} (${secs(r.durationMs)})${note}`;
}

/**
 * @purpose Render one failed rung's full block — marker, exit code, ran command, capped output.
 * @param r The failed rung's result.
 * @returns A multi-line failure block.
 */
function failBlock(r: GateResult): string {
  // A missing REQUIRED rung never ran — there is no exit code or output dump, only the reason.
  if (r.status === 'missing') {
    return `  ⛔ ${r.name} — ${r.output}`;
  }
  const marker = r.mutates ? '🔧' : '❌';
  const haltNote = r.mutates ? ' — repair не завершён' : '';
  return [
    `  ${marker} ${r.name} — exit ${r.exitCode} (ran: ${r.ranCommand})${haltNote}`,
    '  --- output ---',
    tailCap(r.output, r.ranCommand),
    '  --- end ---',
  ].join('\n');
}

/**
 * @purpose Human reason the ladder stops at a repair or foundation rung.
 * @param name The stopping gate's name (`fix`, `type-check`, `test`, or `test:coverage`).
 * @returns A short Russian reason clause, no trailing punctuation.
 */
function haltReason(name: string): string {
  return name === 'fix'
    ? 'после repair нет доказанно чистого post-state — foundation запускать рано'
    : name === 'type-check'
      ? 'код не собирается — дальше нечего проверять и чинить'
      : 'тесты не проходят — код сломал проект, полировать нечего';
}

/**
 * @purpose Reduce ladder results to a verdict — brief on success, detailed only for failed rungs,
 *   honest about where/why the ladder stopped early.
 * @invariant A skipped rung is neither pass nor fail; only `haltedAt` adds a stop reason.
 * @param results Gate results, in the order they actually ran (a halted ladder is simply shorter).
 * @param [haltedAt] Name of the foundation gate that stopped the ladder, if any.
 * @param [profile] The profile that ran — `setup` adds a note that its green verdict is bootstrap-level only.
 * @returns ok with the ✅ summary, or a failure with each failed gate's exit + output.
 */
export function verdict(
  results: GateResult[],
  haltedAt?: string,
  profile?: Profile
): VerifyOutcome {
  // `setup` requires no rung, so its green verdict can rest entirely on ⏭ skips and stub scripts.
  // The profile is chosen by the caller, and nothing cross-checks it against the phase's kind — so
  // the verdict states its own weight rather than passing for a code-phase verdict it is not.
  const setupNote =
    profile === 'setup'
      ? [
          '  ℹ️  профиль setup — вердикт уровня bootstrap: обязательных ступеней нет, пропуски и заглушки',
          '     здесь легальны. Для impl/refactor/test-фазы он НЕ является доказательством — там нужен',
          '     профиль code/test на реальной инфраструктуре.',
        ]
      : [];
  const failed = results.filter((r) => r.status === 'fail' || r.status === 'missing');
  const passed = results.filter((r) => r.status === 'pass');
  const nonFailLines = results
    .filter((r) => r.status !== 'fail' && r.status !== 'missing')
    .map(lineFor);

  if (failed.length === 0) {
    return {
      ok: true,
      text: [
        `[sdd-verify] ✅ ALL PASS (${passed.length}/${results.length})`,
        ...nonFailLines,
        ...setupNote,
      ].join('\n'),
    };
  }

  const haltLine = haltedAt
    ? [
        `[sdd-verify] ⛔ лестница остановлена на «${haltedAt}» — ${haltReason(haltedAt)}, дальше не пошли`,
      ]
    : [];

  return {
    ok: false,
    code: 'ERR_CLI_SDD_VERIFY_GATE_FAILED',
    exitCode: 1,
    message: [
      `[sdd-verify] ${passed.length}/${results.length} passed — ${failed.length} FAILED`,
      ...nonFailLines,
      ...failed.map(failBlock),
      ...haltLine,
    ].join('\n'),
  };
}
