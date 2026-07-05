// @file: Types, error codes, and diagnostic builders for the sdd-sync command.
// @consumers: SddSyncCommand
// @tasks: N/A

/** @purpose No ticket path was passed. */
export const ERR_CLI_SDD_SYNC_BAD_INVOCATION = 'ERR_CLI_SDD_SYNC_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_SYNC_FILE = 'ERR_CLI_SDD_SYNC_FILE' as const;
/** @purpose Ticket Meta lacks a parseable Task-ID or Status. */
export const ERR_CLI_SDD_SYNC_META = 'ERR_CLI_SDD_SYNC_META' as const;
/** @purpose A tracker write did not persist (post-write verification failed). */
export const ERR_CLI_SDD_SYNC_VERIFY = 'ERR_CLI_SDD_SYNC_VERIFY' as const;

/**
 * @purpose Result of one sdd-sync run.
 * @invariant On success `text` is the per-index report; on failure `message` is never empty.
 */
export type SyncOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

/**
 * @purpose Build the bad-invocation diagnostic.
 * @param detail What was wrong.
 * @returns Outcome with exit 4.
 */
export function badInvocation(detail: string): SyncOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SYNC_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-sync] ${ERR_CLI_SDD_SYNC_BAD_INVOCATION}: ${detail}`,
      '  expected: gennady sdd-sync <ticket> [index.3-tasks.md ...]',
      '  With no explicit indexes, every *.3-tasks.md from the ticket dir upward is synced.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-error diagnostic.
 * @param ticket The ticket path.
 * @returns Outcome with exit 1.
 */
export function fileError(ticket: string): SyncOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SYNC_FILE,
    exitCode: 1,
    message: `[sdd-sync] ${ERR_CLI_SDD_SYNC_FILE}: ${ticket}\n  Cannot read the ticket — verify the path.`,
  };
}

/**
 * @purpose Build the unparseable-Meta diagnostic.
 * @param ticket The ticket path.
 * @returns Outcome with exit 2.
 */
export function metaError(ticket: string): SyncOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SYNC_META,
    exitCode: 2,
    message: [
      `[sdd-sync] ${ERR_CLI_SDD_SYNC_META}: ${ticket}`,
      '  Could not read Task-ID + Status from the Meta section. Ensure META has',
      '  `- **Task-ID:** <id>` and `- **Status:** [x] DONE` lines.',
    ].join('\n'),
  };
}
