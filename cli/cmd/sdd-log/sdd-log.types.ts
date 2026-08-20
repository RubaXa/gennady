// @file: Types, error codes, and pure line builders for the sdd-log command.
// @consumers: SddLogCommand
// @tasks: N/A

import { relative, resolve } from 'node:path';
import type { TicketRef } from '../../../shared/sdd/check.ts';
import { unreadableTicketHint } from '../../../shared/sdd/ticket-resolve.ts';

/** @purpose No ticket path, or not exactly one of --round / --line / --close. */
export const ERR_CLI_SDD_LOG_BAD_INVOCATION = 'ERR_CLI_SDD_LOG_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_LOG_FILE = 'ERR_CLI_SDD_LOG_FILE' as const;
/** @purpose Argument has Task-ID shape but no ticket in the tree carries that Meta Task-ID. */
export const ERR_CLI_SDD_LOG_UNKNOWN_ID = 'ERR_CLI_SDD_LOG_UNKNOWN_ID' as const;
/** @purpose More than one ticket carries the same Meta Task-ID (a project-wide collision). */
export const ERR_CLI_SDD_LOG_AMBIGUOUS_ID = 'ERR_CLI_SDD_LOG_AMBIGUOUS_ID' as const;
/** @purpose Ticket has no single clean EXECUTION_LOG section to append to. */
export const ERR_CLI_SDD_LOG_NO_LOG_SECTION = 'ERR_CLI_SDD_LOG_NO_LOG_SECTION' as const;
/** @purpose Content carries an unreplaced `<…>` placeholder — a fabricated / incomplete entry. */
export const ERR_CLI_SDD_LOG_PLACEHOLDER = 'ERR_CLI_SDD_LOG_PLACEHOLDER' as const;
/** @purpose `blocker` mode invoked without required `--axiom` and/or `--unblock`. */
export const ERR_CLI_SDD_LOG_MISSING_FLAG = 'ERR_CLI_SDD_LOG_MISSING_FLAG' as const;

/**
 * @purpose Result of one sdd-log run.
 * @invariant On success `text` echoes the appended lines; on failure `message` is never empty.
 */
export type LogOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

/** @purpose Matches an unreplaced scaffold placeholder like `<ts>`, `<cmd>`, `<pass|fail>`, `<…>` (no inner whitespace). */
export const PLACEHOLDER_RE = /<[^>\s]+>/;

/**
 * @purpose Report whether text still carries an unreplaced placeholder.
 * @param text Candidate log content.
 * @returns True when a `<…>`-style placeholder remains.
 */
export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

/**
 * @purpose Compute the next round number from how many `### Round` headers already exist.
 * @param fileContent Full ticket markdown.
 * @returns Existing round count + 1 (1 for the first round).
 */
export function nextRoundNumber(fileContent: string): number {
  const matches = fileContent.match(/^#{3}\s+Round\s+\d+/gm);
  return (matches?.length ?? 0) + 1;
}

/**
 * @purpose Build a Round header block (blank-line padded) to insert into EXECUTION_LOG.
 * @param n Round number.
 * @param date `YYYY-MM-DD` date string.
 * @param reason Short reason (`initial`, `fix: F-NNN`, `resume`).
 * @returns The header text to splice before the section close marker.
 */
export function buildRoundHeader(n: number, date: string, reason: string): string {
  return `\n### Round ${n} — ${date}, ${reason}\n`;
}

/**
 * @purpose Build a single timestamped, completed event line.
 * @param content The event content (e.g. `DONE`, ``ver `npm run check` → pass exit=0``, `intro Foo`).
 * @param ts Timestamp string.
 * @returns A `- [x] \`<ts>\` <content>` list item.
 */
export function buildEventLine(content: string, ts: string): string {
  return `- [x] \`${ts}\` ${content}`;
}

/**
 * @purpose Build the Round-close block.
 * @param ts Timestamp string.
 * @returns The `#### Round close` header plus a completed DONE line.
 */
export function buildCloseBlock(ts: string): string {
  return `\n#### Round close\n- [x] \`${ts}\` DONE`;
}

/**
 * @purpose Build a phase-block header per `PHASE_BLOCK_FORMAT` — verbatim, no timestamp/escaping.
 * @param phaseId The phase id (e.g. `P1`).
 * @param [suffix] Optional re-run suffix (e.g. `— re-run: F-001`), appended verbatim after a space.
 * @returns The `#### <PhaseID>` header line, blank-line padded like the other block openers.
 */
export function buildPhaseHeader(phaseId: string, suffix?: string): string {
  const head = suffix ? `${phaseId} ${suffix}` : phaseId;
  return `\n#### ${head}\n`;
}

/**
 * @purpose Build the `**Handoff →**` line per `HANDOFF_FORMAT` — verbatim payload, no timestamp.
 * @param payload The typed payload (`artifacts: […]; decisions: […]; open: […]`).
 * @returns The `**Handoff →** <payload>` line, exact bytes.
 */
export function buildHandoffLine(payload: string): string {
  return `**Handoff →** ${payload}`;
}

/**
 * @purpose Build a full BLOCKER_FORMAT block — cause + axiom ref + unblock action.
 * @param reason One-line cause (verbatim).
 * @param axiom Axiom id cited as the trigger (verbatim, e.g. `AX_BLOCKER_ESCALATION`).
 * @param unblock Concrete operator action to resolve the blocker (verbatim).
 * @param ts Timestamp string.
 * @returns The `- 🛑 …` / `  - 🔗 axiom: …` / `  - 💬 unblock: …` block.
 */
export function buildBlockerBlock(
  reason: string,
  axiom: string,
  unblock: string,
  ts: string
): string {
  return [
    `- 🛑 \`${ts}\` BLOCKED: ${reason}`,
    `  - 🔗 axiom: ${axiom}`,
    `  - 💬 unblock: ${unblock}`,
  ].join('\n');
}

/**
 * @purpose Build the missing-flag diagnostic for `blocker` mode.
 * @param detail What flag was missing.
 * @returns Outcome with exit 4.
 */
export function missingFlag(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_MISSING_FLAG,
    exitCode: 4,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_MISSING_FLAG}: ${detail}`,
      '  expected: gennady sdd-log <ticket> blocker "<reason>" --axiom <AX_NAME> --unblock "<concrete action>"',
    ].join('\n'),
  };
}

/**
 * @purpose Build the bad-invocation diagnostic.
 * @param detail What was wrong.
 * @returns Outcome with exit 4.
 */
export function badInvocation(detail: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_BAD_INVOCATION}: ${detail}`,
      '  expected: gennady sdd-log <ticket> <mode> [content]',
      '  modes: round "<reason>" | line "<content>" | close | phase <P-ID> ["— re-run: <reason>"] |',
      '         handoff "<payload>" | blocker "<reason>" --axiom <AX_NAME> --unblock "<action>"',
      '  content must carry no <…> placeholder.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the placeholder-rejection diagnostic.
 * @param content The offending content.
 * @returns Outcome with exit 2.
 */
export function placeholderError(content: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_PLACEHOLDER,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_PLACEHOLDER}: "${content}"`,
      '  Content still has an unreplaced <…> placeholder — that is a fabricated / incomplete log entry.',
      '  Replace every placeholder with a real value (the actual command, exit code, name) before logging.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-error diagnostic — tool-teaches: points a path-shaped argument at the map.
 * @param ticket The ticket path or Task-ID that could not be resolved.
 * @returns Outcome with exit 1.
 */
export function fileError(ticket: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_FILE,
    exitCode: 1,
    message: `[sdd-log] ${ERR_CLI_SDD_LOG_FILE}: ${ticket}\n  ${unreadableTicketHint(ticket)}`,
  };
}

/**
 * @purpose Build the unknown-Task-ID diagnostic — the argument has Task-ID shape but scanning the tree
 * found no ticket carrying that Meta Task-ID.
 * @param id The requested Task-ID.
 * @param refs Every ticket's graph ref found while scanning (for the "known Task-IDs" hint).
 * @returns Outcome with exit 2.
 */
export function unknownIdError(id: string, refs: TicketRef[]): LogOutcome {
  const known = refs.map((r) => r.taskId).filter((t): t is string => t != null);
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_UNKNOWN_ID,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_UNKNOWN_ID}: ${id}`,
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
export function ambiguousIdError(id: string, matches: TicketRef[], root: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_AMBIGUOUS_ID,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_AMBIGUOUS_ID}: ${id} matches ${matches.length} tickets`,
      ...matches.map((m) => `  - ${relative(root, resolve(m.file))}`),
    ].join('\n'),
  };
}

/**
 * @purpose Build the missing-log-section diagnostic.
 * @param ticket The ticket path.
 * @returns Outcome with exit 2.
 */
export function noLogSection(ticket: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_NO_LOG_SECTION,
    exitCode: 2,
    message: [
      `[sdd-log] ${ERR_CLI_SDD_LOG_NO_LOG_SECTION}: ${ticket}`,
      '  No single clean <!--SECTION:EXECUTION_LOG--> … <!--/SECTION:EXECUTION_LOG--> pair to append to.',
      '  Scaffold or repair the Execution Log section first.',
    ].join('\n'),
  };
}
