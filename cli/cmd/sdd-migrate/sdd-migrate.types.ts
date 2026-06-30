// @file: Types and diagnostics for the sdd-migrate command.
// @consumers: SddMigrateCommand
// @tasks: N/A

/** @purpose Unknown mode, or missing target. */
export const ERR_CLI_SDD_MIGRATE_BAD_INVOCATION = 'ERR_CLI_SDD_MIGRATE_BAD_INVOCATION' as const;
/** @purpose A ticket file could not be read. */
export const ERR_CLI_SDD_MIGRATE_FILE = 'ERR_CLI_SDD_MIGRATE_FILE' as const;

/**
 * @purpose Result of one sdd-migrate run — a per-file report (exit 0) or an actionable failure.
 * @invariant On failure `message` is never empty; `exitCode` is 1 (file) or 4 (bad invocation).
 */
export type MigrateOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 4; message: string };

/** @purpose Build the bad-invocation diagnostic. | @param detail What was wrong. | @returns Outcome with exit 4. */
export function badInvocation(detail: string): MigrateOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_MIGRATE_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-migrate] ${ERR_CLI_SDD_MIGRATE_BAD_INVOCATION}: ${detail}`,
      '  expected: gennady sdd-migrate anchors (<ticket> | --all [root]) [--write]',
      '  Without --write it is a dry-run (reports what it would change).',
    ].join('\n'),
  };
}
