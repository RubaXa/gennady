// @file: Strict invocation contract for the unified `gennady verify` command.
// @spec: CLI-VERIFY
// @consumers: VerifyCommand

import { parseArgs } from '../../../shared/common/parse-args.ts';

const ERR_CLI_VERIFY_BAD_INVOCATION = 'ERR_CLI_VERIFY_BAD_INVOCATION' as const;

/** @purpose Normalized public verify invocation; CLI selects a phase and presentation only. */
export type VerifyInvocation = {
  /** @purpose Exact preset phase selected by the operator. */
  readonly phase: string;
  /** @purpose True only for the strict no-spawn projection path. */
  readonly planOnly: boolean;
  /** @purpose Explicit JSON or default operator text presentation. */
  readonly format: 'text' | 'json';
};

/** @purpose Return either a complete invocation or an actionable exit-4 diagnostic. */
export type VerifyInvocationResult =
  | { readonly ok: true; readonly invocation: VerifyInvocation }
  | { readonly ok: false; readonly message: string };

function badInvocationMessage(detail: string): string {
  return [
    `[verify] ${ERR_CLI_VERIFY_BAD_INVOCATION}: ${detail}`,
    '  usage: npx gennady verify --phase=<phase> [--json]',
    '         npx gennady verify --plan --json [--phase=<phase>]',
    '  --plan is read-only and never spawns a verification step.',
  ].join('\n');
}

/**
 * @purpose Parse the target verify facade without inventing pipeline or scope defaults.
 * @param argv Full process argv accepted by the shared parser.
 * @returns A target phase invocation; legacy `--plan --json` defaults only that compatibility form
 *   to `full`.
 */
export function parseVerifyInvocation(argv: string[]): VerifyInvocationResult {
  let parsed: Record<string, unknown> & { _: string[] };
  try {
    parsed = parseArgs(
      argv,
      {
        phase: { aliases: ['phase'], takesValue: true },
        plan: { aliases: ['plan'] },
        json: { aliases: ['json'] },
      },
      { strict: true }
    );
  } catch (cause) {
    return {
      ok: false,
      message: badInvocationMessage(cause instanceof Error ? cause.message : String(cause)),
    };
  }

  const positional = parsed._.slice(1);
  if (positional.length > 0) {
    return {
      ok: false,
      message: badInvocationMessage(`unexpected path argument(s): ${positional.join(' ')}`),
    };
  }
  if (Array.isArray(parsed.phase) || Array.isArray(parsed.plan) || Array.isArray(parsed.json)) {
    return { ok: false, message: badInvocationMessage('flags may be provided only once') };
  }
  if (parsed.plan !== undefined && parsed.plan !== true) {
    return { ok: false, message: badInvocationMessage('--plan does not accept a value') };
  }
  if (parsed.json !== undefined && parsed.json !== true) {
    return { ok: false, message: badInvocationMessage('--json does not accept a value') };
  }

  const planOnly = parsed.plan === true;
  if (planOnly && parsed.json !== true) {
    return {
      ok: false,
      message: badInvocationMessage('--plan requires --json so plan output stays machine-explicit'),
    };
  }
  const phase = planOnly && parsed.phase === undefined ? 'full' : parsed.phase;
  if (typeof phase !== 'string' || phase.length === 0 || phase !== phase.trim()) {
    return {
      ok: false,
      message: badInvocationMessage('a non-empty --phase is required for execution'),
    };
  }
  return {
    ok: true,
    invocation: {
      phase,
      planOnly,
      format: parsed.json === true ? 'json' : 'text',
    },
  };
}
