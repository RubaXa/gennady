// @file: Types, error codes, and diagnostic builders for the sdd-sync command.
// @consumers: SddSyncCommand
// @tasks: N/A

import { relative, resolve } from 'node:path';
import type { TicketRef } from '../../../shared/sdd/check.ts';
import { unreadableTicketHint } from '../../../shared/sdd/ticket-resolve.ts';

/** @purpose No ticket path was passed. */
export const ERR_CLI_SDD_SYNC_BAD_INVOCATION = 'ERR_CLI_SDD_SYNC_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_SYNC_FILE = 'ERR_CLI_SDD_SYNC_FILE' as const;
/** @purpose Argument has Task-ID shape but no ticket in the tree carries that Meta Task-ID. */
export const ERR_CLI_SDD_SYNC_UNKNOWN_ID = 'ERR_CLI_SDD_SYNC_UNKNOWN_ID' as const;
/** @purpose More than one ticket carries the same Meta Task-ID (a project-wide collision). */
export const ERR_CLI_SDD_SYNC_AMBIGUOUS_ID = 'ERR_CLI_SDD_SYNC_AMBIGUOUS_ID' as const;
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
      '  Paths must be exact repository-relative regular files; indexes must be owning specs indexes.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-error diagnostic — tool-teaches: points a path-shaped argument at the map.
 * @param ticket The ticket path or Task-ID that could not be resolved.
 * @returns Outcome with exit 1.
 */
export function fileError(ticket: string): SyncOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SYNC_FILE,
    exitCode: 1,
    message: `[sdd-sync] ${ERR_CLI_SDD_SYNC_FILE}: ${ticket}\n  ${unreadableTicketHint(ticket)}`,
  };
}

/**
 * @purpose Build the unknown-Task-ID diagnostic — the argument has Task-ID shape but scanning the tree
 * found no ticket carrying that Meta Task-ID.
 * @param id The requested Task-ID.
 * @param refs Every ticket's graph ref found while scanning (for the "known Task-IDs" hint).
 * @returns Outcome with exit 2.
 */
export function unknownIdError(id: string, refs: TicketRef[]): SyncOutcome {
  const known = refs.map((r) => r.taskId).filter((t): t is string => t != null);
  return {
    ok: false,
    code: ERR_CLI_SDD_SYNC_UNKNOWN_ID,
    exitCode: 2,
    message: [
      `[sdd-sync] ${ERR_CLI_SDD_SYNC_UNKNOWN_ID}: ${id}`,
      known.length
        ? `  known Task-IDs: ${known.join(', ')}`
        : '  очередь пуста — тикетов с Task-ID в дереве не найдено.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the ambiguous-Task-ID diagnostic — two or more tickets share one Meta Task-ID.
 * @param id The requested Task-ID.
 * @param matches Every ticket ref whose Task-ID equals `id`.
 * @param root Absolute project root (candidate paths are printed relative to it).
 * @returns Outcome with exit 2.
 */
export function ambiguousIdError(id: string, matches: TicketRef[], root: string): SyncOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SYNC_AMBIGUOUS_ID,
    exitCode: 2,
    message: [
      `[sdd-sync] ${ERR_CLI_SDD_SYNC_AMBIGUOUS_ID}: ${id} matches ${matches.length} tickets`,
      ...matches.map((m) => `  - ${relative(root, resolve(m.file))}`),
    ].join('\n'),
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
