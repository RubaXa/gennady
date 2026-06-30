// @file: sdd-sync command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-sync command.
 */
export function printHelp(): void {
  console.info('gennady sdd-sync — Propagate a ticket Status into the *.3-tasks.md trackers');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-sync <ticket> [index.3-tasks.md ...]');
  console.info('');
  console.info('Behaviour:');
  console.info('  Reads Task-ID + Status from the ticket Meta, then for each tracker:');
  console.info(
    '    - finds the row by Task-ID, rewrites only its Status cell (column found by header)'
  );
  console.info('    - verifies the write persisted before reporting "updated"');
  console.info(
    '  With no explicit indexes, every *.3-tasks.md from the ticket dir upward is synced'
  );
  console.info('  (module → scope → project).');
  console.info('');
  console.info('Report lines: updated / in-sync / no-row / no-table / unreadable per index.');
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 synced (report)   1 ticket unreadable / verify failed   2 Meta unparseable   4 bad invocation'
  );
}
