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
    '  npx gennady sdd-session close                                      # discard the session'
  );
  console.info('');
  console.info('Guarantees:');
  console.info(
    '  - open is idempotent — an existing session file is never overwritten; reports "already open".'
  );
  console.info(
    '  - open ensures specs/.sdd-session.md is git-ignored — appends the line to .gitignore (creates it if absent).'
  );
  console.info(
    '  - No fabricated values — content with an unreplaced <…> placeholder is rejected (exit 2).'
  );
  console.info('  - close deletes the file — the session is scratch, never a deliverable.');
  console.info('');
  console.info('Exit codes:');
  console.info('  0 ok   1 file I/O error   2 no open session / placeholder   4 bad invocation');
}
