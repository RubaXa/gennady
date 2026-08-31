// @file: sdd-session command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-session command.
 */
export function printHelp(): void {
  console.info(
    'gennady sdd-session — CLI-owned specs/.sdd-session.md scratch file (SESSION_FILE_FORMAT)'
  );
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx gennady sdd-session open --intent <intent> [--scale <scale>]  # create the session (idempotent)'
  );
  console.info(
    '  npx gennady sdd-session set <intent|scale|open> "<value>"         # replace a single-line field'
  );
  console.info(
    '  npx gennady sdd-session log "<line>"                               # append to journal'
  );
  console.info(
    '  npx gennady sdd-session workset "<line>"                          # append to working set'
  );
  console.info(
    '  npx gennady sdd-session term "<term> — <phrasing>"                # add/replace a glossary entry'
  );
  console.info(
    '  npx gennady sdd-session close                                      # discard the session'
  );
  console.info('');
  console.info('File-backed form (required for agent-produced free text):');
  console.info('  npx gennady sdd-session <log|workset|term> --content-file .claude/tmp/<name>');
  console.info(
    '  npx gennady sdd-session set <intent|scale|open> --content-file .claude/tmp/<name>'
  );
  console.info('');
  console.info('Guarantees:');
  console.info(
    '  - open is storage-idempotent — an existing session file is never overwritten; callers must compare its intent before reuse.'
  );
  console.info(
    '  - open ensures specs/.sdd-session.md is git-ignored — appends the line to .gitignore (creates it if absent).'
  );
  console.info(
    '  - open also creates/proves the regular non-symlink .claude/tmp/ payload boundary used by later steps.'
  );
  console.info(
    '  - No fabricated values — content with an unreplaced <…> placeholder is rejected (exit 2).'
  );
  console.info('  - close deletes the file — the session is scratch, never a deliverable.');
  console.info(
    '  - Payload files are exact regular non-symlink UTF-8 files under .claude/tmp/, bounded to 32768 bytes.'
  );
  console.info(
    '  - Payload bytes are never shell-interpreted; the exact file is deleted only after a successful update.'
  );
  console.info(
    '  - A file-backed workset payload may contain multiple non-empty lines; each line becomes one exact working-set bullet in one command.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info('  0 ok   1 file I/O error   2 no open session / placeholder   4 bad invocation');
}
