// @file: Invocation shape and result types for the read-only `gennady verify` facade (V-16a, D-13).
// @consumers: VerifyCommand
// @tasks: N/A

import { parseArgs } from '../../../shared/common/parse-args.ts';

/** @purpose CLI invocation carried an extra positional path, or a flag other than `--plan --json` — verify never silently narrows or ignores. */
const ERR_CLI_VERIFY_BAD_INVOCATION = 'ERR_CLI_VERIFY_BAD_INVOCATION' as const;

/**
 * @purpose Build the bad-invocation diagnostic — tool-teaches: names the problem and the one usage.
 * @param detail What was wrong with the invocation.
 * @returns The full multi-line message, ready to print (exit code 4).
 */
function badInvocationMessage(detail: string): string {
  return [
    `[verify] ${ERR_CLI_VERIFY_BAD_INVOCATION}: ${detail}`,
    '  gennady verify is a read-only planner/CI-reporter (D-13) — it never runs a gate.',
    '  usage: npx gennady verify --plan --json',
  ].join('\n');
}

/** @purpose Strict CLI shape: always both `--plan` and `--json` together — the one public form (D-13). */
type VerifyInvocationResult = { ok: true } | { ok: false; message: string };

/**
 * @purpose Parse `gennady verify` strictly: only the exact `--plan --json` form is public.
 * @param argv Full `process.argv` — the shape `parseArgs` expects.
 * @returns Ok once `--plan` and `--json` are both present with no extra argument, else a
 *   ready-to-print bad-invocation message (exit code 4).
 */
export function parseVerifyInvocation(argv: string[]): VerifyInvocationResult {
  let parsed: Record<string, unknown> & { _: string[] };
  try {
    parsed = parseArgs(
      argv,
      {
        plan: { aliases: ['plan'] },
        json: { aliases: ['json'] },
      },
      { strict: true }
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, message: badInvocationMessage(detail) };
  }

  // parseArgs keeps the command token itself (argv[2], e.g. "verify") in `_` alongside any real
  // positional — drop it before judging whether the caller passed an actual extra argument.
  const positional = parsed._.slice(1);
  if (positional.length > 0) {
    return {
      ok: false,
      message: badInvocationMessage(`unexpected path argument(s): ${positional.join(' ')}`),
    };
  }
  if (parsed.plan !== true || parsed.json !== true) {
    return {
      ok: false,
      message: badInvocationMessage(
        `both --plan and --json are required (got: ${JSON.stringify({ plan: parsed.plan, json: parsed.json })})`
      ),
    };
  }
  return { ok: true };
}

/** @purpose One gate's read-only plan entry — name, exact runnable command, and required flag. */
export type VerifyPlanGate = {
  /** @purpose Canonical full-profile gate name (e.g. `type-check`, `lint`, `yagni`). */
  readonly name: string;
  /** @purpose Exact command this gate would run, or null until a real script/dispatch exists. */
  readonly command: string | null;
  /** @purpose Whether an absent/vacuous script would fail the full-profile ladder. */
  readonly required: boolean;
};

/** @purpose The whole read-only plan document `gennady verify --plan --json` prints. */
export type VerifyPlanDocument = {
  /** @purpose Always `'full'` — the one profile this read-only facade reports (D-13). */
  readonly profile: 'full';
  /** @purpose Resolved primary stack; always `'node'` today (the full profile is node-only). */
  readonly stack: string;
  /** @purpose Gates in canonical ladder order. */
  readonly gates: readonly VerifyPlanGate[];
};
