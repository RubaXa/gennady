// @file: Strict public invocation parser for the thin SDD Verify facade.
// @spec: CLI-SDD-VERIFY
// @consumers: sdd-verify/index.ts

import { parseArgs } from '../../../shared/common/parse-args.ts';

/** @purpose Stable invalid-invocation diagnostic for the task/phase-only SDD facade. */
export const ERR_CLI_SDD_VERIFY_BAD_INVOCATION = 'ERR_CLI_SDD_VERIFY_BAD_INVOCATION' as const;

function badInvocationMessage(detail: string): string {
  return [
    `[sdd-verify] ${ERR_CLI_SDD_VERIFY_BAD_INVOCATION}: ${detail}`,
    '  Phase verification reads kind, Target Files, and owning spec from the ticket.',
    '  usage: npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>',
    '  Whole-project verification: npx gennady verify --phase full',
  ].join('\n');
}

/**
 * @purpose Parse only task/phase facade identity; old profile/selectors fail as unknown flags.
 * @param argv Complete process argv including node and command entrypoint tokens.
 * @returns Complete invocation identity or one stable teaching diagnostic.
 */
export function parseSddVerifyInvocation(argv: string[]):
  | {
      readonly ok: true;
      readonly invocation: {
        readonly task: string;
        readonly phase: string;
      };
    }
  | { readonly ok: false; readonly message: string } {
  let parsed: Record<string, unknown> & { _: string[] };
  try {
    parsed = parseArgs(
      argv,
      {
        task: { aliases: ['task'], takesValue: true },
        phase: { aliases: ['phase'], takesValue: true },
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
  const scalar = (
    key: 'task' | 'phase'
  ):
    | { readonly ok: true; readonly value?: string }
    | { readonly ok: false; readonly message: string } => {
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
  const task = scalar('task');
  if (!task.ok) return task;
  const phase = scalar('phase');
  if (!phase.ok) return phase;
  if (task.value === undefined || phase.value === undefined) {
    return {
      ok: false,
      message: badInvocationMessage(
        'phase verification requires both --task <ticket-path> and --phase <PhaseID>'
      ),
    };
  }
  return {
    ok: true,
    invocation: {
      task: task.value,
      phase: phase.value,
    },
  };
}
