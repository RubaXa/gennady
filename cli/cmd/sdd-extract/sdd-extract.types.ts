// @file: Types, error codes, and diagnostic builders for the sdd-extract command.
// @consumers: SddExtractCommand
// @tasks: N/A

import { SECTION_NAME_REGEX, type SectionResult } from '../../../shared/sdd/section.ts';

/** @purpose Bad invocation — wrong number of positional arguments. */
export const ERR_CLI_SDD_EXTRACT_BAD_INVOCATION = 'ERR_CLI_SDD_EXTRACT_BAD_INVOCATION' as const;
/** @purpose Section name does not match the canonical anchor grammar. */
export const ERR_CLI_SDD_EXTRACT_INVALID_NAME = 'ERR_CLI_SDD_EXTRACT_INVALID_NAME' as const;
/** @purpose Target file does not exist (ENOENT). */
export const ERR_CLI_SDD_EXTRACT_FILE_NOT_FOUND = 'ERR_CLI_SDD_EXTRACT_FILE_NOT_FOUND' as const;
/** @purpose Target file exists but cannot be read (EACCES, EISDIR, …). */
export const ERR_CLI_SDD_EXTRACT_FILE_NOT_READABLE =
  'ERR_CLI_SDD_EXTRACT_FILE_NOT_READABLE' as const;
/** @purpose Requested section has no anchor markers in the file. */
export const ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND = 'ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND' as const;
/** @purpose Markers are present and balanced but the section body is empty. */
export const ERR_CLI_SDD_EXTRACT_ANCHOR_EMPTY = 'ERR_CLI_SDD_EXTRACT_ANCHOR_EMPTY' as const;
/** @purpose Open and close marker counts do not match — corrupted markers. */
export const ERR_CLI_SDD_EXTRACT_ANCHOR_UNBALANCED =
  'ERR_CLI_SDD_EXTRACT_ANCHOR_UNBALANCED' as const;
/** @purpose The same section appears more than once — extraction is ambiguous. */
export const ERR_CLI_SDD_EXTRACT_ANCHOR_DUPLICATED =
  'ERR_CLI_SDD_EXTRACT_ANCHOR_DUPLICATED' as const;

const CANONICAL =
  'META, PHASES_OVERVIEW, PHASE_P<N>, PHASE_P<N>_FIX, BDD, VERIFICATION, TEST_COVERAGE, EXECUTION_LOG';

/**
 * @purpose Result of one extraction run — either the section content (exit 0) or an actionable failure.
 * @invariant On failure, `message` is never empty (AX_BASH_NO_SILENT_EMPTY) and `exitCode` mirrors extract-section.sh (1 file, 2 anchor-absent/empty, 3 marker-corruption, 4 bad-invocation/name).
 */
export type ExtractOutcome =
  | { ok: true; content: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 3 | 4; message: string };

/**
 * @purpose Build the bad-invocation diagnostic.
 * @returns Outcome with exit 4.
 */
export function badInvocation(): ExtractOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_EXTRACT_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_BAD_INVOCATION}`,
      '  expected: gennady sdd-extract <file> <NAME>',
      `  NAME must match ${SECTION_NAME_REGEX} — e.g. META, PHASES_OVERVIEW, PHASE_P1, BDD, EXECUTION_LOG.`,
    ].join('\n'),
  };
}

/**
 * @purpose Build the invalid-name diagnostic.
 * @param name The rejected section name.
 * @returns Outcome with exit 4.
 */
export function invalidName(name: string): ExtractOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_EXTRACT_INVALID_NAME,
    exitCode: 4,
    message: [
      `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_INVALID_NAME}: "${name}"`,
      '  Use uppercase letters, digits, and underscores, starting with a letter.',
      '  Put attributes (kind, rules) inside the section body, not in the anchor name.',
      `  Canonical: ${CANONICAL}.`,
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-not-found diagnostic.
 * @param file The missing path.
 * @returns Outcome with exit 1.
 */
export function fileNotFound(file: string): ExtractOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_EXTRACT_FILE_NOT_FOUND,
    exitCode: 1,
    message: [
      `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_FILE_NOT_FOUND}: ${file}`,
      '  Verify the path (typo, wrong scope, wrong task-id). Do not dispatch a phase agent until the ticket is located.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-not-readable diagnostic.
 * @param file The unreadable path.
 * @returns Outcome with exit 1.
 */
export function fileNotReadable(file: string): ExtractOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_EXTRACT_FILE_NOT_READABLE,
    exitCode: 1,
    message: [
      `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_FILE_NOT_READABLE}: ${file}`,
      '  The path exists but cannot be read (permissions, or it is a directory). Check it, then retry.',
    ].join('\n'),
  };
}

/**
 * @purpose Map a SectionResult to an ExtractOutcome, attaching file/name context to the diagnostic.
 * @param file Path the section was read from.
 * @param name Section name requested.
 * @param result Outcome of the pure extractor.
 * @returns Content outcome for `ok`, else the matching actionable failure.
 */
export function toOutcome(file: string, name: string, result: SectionResult): ExtractOutcome {
  const start = `<!--SECTION:${name}-->`;
  const end = `<!--/SECTION:${name}-->`;
  switch (result.status) {
    case 'ok':
      return { ok: true, content: result.content };
    case 'invalid_name':
      return invalidName(name);
    case 'not_found':
      return {
        ok: false,
        code: ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND,
        exitCode: 2,
        message: [
          `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_ANCHOR_NOT_FOUND}: section ${name} in ${file}`,
          `  searched: ${start} / ${end}`,
          '  Read the file: if the section exists as a header, retrofit anchors; if absent, the ticket needs (re)scaffolding.',
          '  Do not dispatch a phase agent until anchors are in place.',
        ].join('\n'),
      };
    case 'empty':
      return {
        ok: false,
        code: ERR_CLI_SDD_EXTRACT_ANCHOR_EMPTY,
        exitCode: 2,
        message: [
          `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_ANCHOR_EMPTY}: section ${name} in ${file}`,
          '  Markers are present and balanced but the section is empty. Re-author the content, or reference a section that carries payload.',
        ].join('\n'),
      };
    case 'unbalanced':
      return {
        ok: false,
        code: ERR_CLI_SDD_EXTRACT_ANCHOR_UNBALANCED,
        exitCode: 3,
        message: [
          `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_ANCHOR_UNBALANCED}: section ${name} in ${file}`,
          `  ${start} ×${result.startCount}, ${end} ×${result.endCount}`,
          '  Restore the missing marker or remove the duplicate, then retry. Do not dispatch a phase agent until markers balance.',
        ].join('\n'),
      };
    case 'duplicated':
      return {
        ok: false,
        code: ERR_CLI_SDD_EXTRACT_ANCHOR_DUPLICATED,
        exitCode: 3,
        message: [
          `[sdd-extract] ${ERR_CLI_SDD_EXTRACT_ANCHOR_DUPLICATED}: section ${name} ×${result.count} in ${file}`,
          '  The section appears more than once — extraction is ambiguous. Merge them or rename one (e.g. PHASE_P1 vs PHASE_P1_FIX), then retry.',
        ].join('\n'),
      };
  }
}
