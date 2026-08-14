// @file: Types, error codes, and pure builders for the sdd-session command (SESSION_FILE_FORMAT owner).
// @consumers: SddSessionCommand
// @tasks: N/A

/** @purpose No sub-mode, or an unknown one. */
export const ERR_CLI_SDD_SESSION_BAD_INVOCATION = 'ERR_CLI_SDD_SESSION_BAD_INVOCATION' as const;
/** @purpose specs/ or the session file could not be read/written. */
export const ERR_CLI_SDD_SESSION_FILE = 'ERR_CLI_SDD_SESSION_FILE' as const;
/** @purpose set/log/workset/close invoked with no session open (file absent). */
export const ERR_CLI_SDD_SESSION_NO_SESSION = 'ERR_CLI_SDD_SESSION_NO_SESSION' as const;
/** @purpose Content carries an unreplaced `<…>` placeholder — a fabricated / incomplete value. */
export const ERR_CLI_SDD_SESSION_PLACEHOLDER = 'ERR_CLI_SDD_SESSION_PLACEHOLDER' as const;

/**
 * @purpose Result of one sdd-session run.
 * @invariant On success `text` reports what happened; on failure `message` is never empty.
 */
export type SessionOutcome =
  | { ok: true; text: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

/** @purpose Matches an unreplaced scaffold placeholder like `<intent>`, `<scale>` (no inner whitespace). */
export const PLACEHOLDER_RE = /<[^>\s]+>/;

/** @purpose Fields `set` may replace — the single-line fields of SESSION_FILE_FORMAT. */
export const SET_FIELDS = ['intent', 'scale', 'open'] as const;
/** @purpose One of the single-line fields `set` may replace: `intent`, `scale`, or `open`. */
export type SetField = (typeof SET_FIELDS)[number];

/** @purpose The `field:` header lines SESSION_FILE_FORMAT defines, used to bound section inserts. */
const FIELD_HEADER_RE = /^(intent|scale|working set|journal|open):/;

/**
 * @purpose Report whether text still carries an unreplaced placeholder.
 * @param text Candidate value.
 * @returns True when a `<…>`-style placeholder remains.
 */
export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

/**
 * @purpose Build the SESSION_FILE_FORMAT skeleton for a freshly opened session.
 * @param date `YYYY-MM-DD` date string.
 * @param intent The classified intent (operator-confirmed).
 * @param [scale] SCALE value; `—` when not yet known.
 * @returns The full skeleton file content, trailing newline included.
 */
export function buildSkeleton(date: string, intent: string, scale?: string): string {
  return [
    `# SDD session — ${date}`,
    `intent: ${intent}`,
    `scale: ${scale ?? '—'}`,
    'working set:',
    'journal:',
    'open: —',
    '',
  ].join('\n');
}

/**
 * @purpose Replace the value of a single-line field (`intent:` / `scale:` / `open:`).
 * @param content Full session file content.
 * @param field The field to replace.
 * @param value The new value (verbatim, one line).
 * @returns Updated content; the field line is added at end-of-file if it was missing.
 */
export function setField(content: string, field: SetField, value: string): string {
  const prefix = `${field}: `;
  const lines = content.split('\n');
  let found = false;
  const out = lines.map((l) => {
    if (l.startsWith(prefix)) {
      found = true;
      return `${prefix}${value}`;
    }
    return l;
  });
  if (!found) out.push(`${prefix}${value}`);
  return out.join('\n');
}

/**
 * @purpose Append a `- <line>` bullet at the end of a section (`working set:` or `journal:`).
 * @param content Full session file content.
 * @param header The section header to append under (`working set` or `journal`, no trailing colon).
 * @param line The bullet content, verbatim.
 * @returns Updated content, or null when the section header is not present.
 */
export function appendToSection(content: string, header: string, line: string): string | null {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.trim() === `${header}:`);
  if (idx === -1) return null;

  let insertAt = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (FIELD_HEADER_RE.test(lines[i].trim())) {
      insertAt = i;
      break;
    }
  }
  lines.splice(insertAt, 0, `  - ${line}`);
  return lines.join('\n');
}

/**
 * @purpose Build the bad-invocation diagnostic.
 * @param detail What was wrong.
 * @returns Outcome with exit 4.
 */
export function badInvocation(detail: string): SessionOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SESSION_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-session] ${ERR_CLI_SDD_SESSION_BAD_INVOCATION}: ${detail}`,
      '  expected: gennady sdd-session open --intent <intent> [--scale <scale>]',
      '        | gennady sdd-session set <intent|scale|open> "<value>"',
      '        | gennady sdd-session log "<line>" | workset "<line>" | close',
    ].join('\n'),
  };
}

/**
 * @purpose Build the placeholder-rejection diagnostic.
 * @param content The offending value.
 * @returns Outcome with exit 2.
 */
export function placeholderError(content: string): SessionOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SESSION_PLACEHOLDER,
    exitCode: 2,
    message: [
      `[sdd-session] ${ERR_CLI_SDD_SESSION_PLACEHOLDER}: "${content}"`,
      '  Value still has an unreplaced <…> placeholder — that is a fabricated / incomplete session entry.',
      '  Replace every placeholder with a real value before writing it to the session.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the no-session diagnostic (set/log/workset/close with no open session).
 * @param sessionPath The expected session file path.
 * @returns Outcome with exit 2.
 */
export function noSession(sessionPath: string): SessionOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SESSION_NO_SESSION,
    exitCode: 2,
    message: [
      `[sdd-session] ${ERR_CLI_SDD_SESSION_NO_SESSION}: ${sessionPath}`,
      '  No open session — run `gennady sdd-session open --intent <intent>` first.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-error diagnostic.
 * @param detail What could not be read/written.
 * @returns Outcome with exit 1.
 */
export function fileError(detail: string): SessionOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_SESSION_FILE,
    exitCode: 1,
    message: `[sdd-session] ${ERR_CLI_SDD_SESSION_FILE}: ${detail}`,
  };
}
