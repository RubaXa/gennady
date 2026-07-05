// @file: Types, error codes, and pure line builders for the sdd-log command.
// @consumers: SddLogCommand
// @tasks: N/A

/** @purpose No ticket path, or not exactly one of --round / --line / --close. */
export const ERR_CLI_SDD_LOG_BAD_INVOCATION = 'ERR_CLI_SDD_LOG_BAD_INVOCATION' as const;
/** @purpose Ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_LOG_FILE = 'ERR_CLI_SDD_LOG_FILE' as const;
/** @purpose Ticket has no single clean EXECUTION_LOG section to append to. */
export const ERR_CLI_SDD_LOG_NO_LOG_SECTION = 'ERR_CLI_SDD_LOG_NO_LOG_SECTION' as const;
/** @purpose Content carries an unreplaced `<…>` placeholder — a fabricated / incomplete entry. */
export const ERR_CLI_SDD_LOG_PLACEHOLDER = 'ERR_CLI_SDD_LOG_PLACEHOLDER' as const;

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
      '  expected: gennady sdd-log <ticket> (--round "<reason>" | --line "<content>" | --close)',
      '  exactly one mode; <content> must carry no <…> placeholder.',
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
 * @purpose Build the file-error diagnostic.
 * @param ticket The ticket path.
 * @returns Outcome with exit 1.
 */
export function fileError(ticket: string): LogOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_LOG_FILE,
    exitCode: 1,
    message: `[sdd-log] ${ERR_CLI_SDD_LOG_FILE}: ${ticket}\n  Cannot read or write the ticket — verify the path.`,
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
