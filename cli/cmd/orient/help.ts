// @file: Help output for the gennady orient command.
// @spec: CLI-ORIENT
// @consumers: help command

/**
 * @purpose Print help text for the gennady orient command.
 * @sideEffect Console: writes usage, options, and examples to stdout.
 */
export function printHelp(): void {
  console.info('gennady orient — Navigate project structure via file headers and DBC contracts');
  console.info('');
  console.info('Not `sdd-orient` (that one navigates specs/design, not code — .spec.md graphs).');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady orient [options] [keyword]');
  console.info('');
  console.info('Options:');
  console.info(
    '  --coverage          Query declared SDD coverage without scanning unclaimed sources'
  );
  console.info('                      Optional --spec ID/path or --task ID/path --phase ID');
  console.info(
    '                      --stage authoring|preflight|phase-exit|audit (default audit)'
  );
  console.info(
    '                      --json: versioned map + explicit read counters, not Verify PASS'
  );
  console.info('  --file=<path>       Show detailed view of a specific file (repeatable)');
  console.info('  --dir=<path>        Limit scanning to a directory');
  console.info('  --task=<ACR-slug>   Find canonical resolver relations (repeatable)');
  console.info(
    '                      Legacy @tasks matches are read-only migration evidence, not ownership'
  );
  console.info('  --consumer=<name>   Find files by consumer name (repeatable)');
  console.info('  --entity=<name>     Search for an exported entity (repeatable)');
  console.info('  --graph             Show consumer dependency graph');
  console.info('  --recursive         Expand graph recursively');
  console.info('  --specs             List all specs and their tasks');
  console.info('  --spec=<name>       Show tasks for a specific spec');
  console.info('  --detail            Include DBC contract details in output');
  console.info('  --fuzzy             Enable fuzzy matching for --entity and --consumer');
  console.info('  --depth=<N>         Limit tree or graph depth');
  console.info('  --max-results=<N>   Limit number of files shown');
  console.info('  --history           Expand historical relations for one --file');
  console.info('  --json              Emit versioned relations JSON for one --file');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady orient --coverage --spec specs/README.md --json');
  console.info('  npx gennady orient --coverage --task CORE-work --phase P1 --stage preflight');
  console.info('  npx gennady orient                        Project map (S1)');
  console.info('  npx gennady orient --file=index.ts        Detailed file view (S5)');
  console.info('  npx gennady orient --file=index.ts --history  Expand ownership history');
  console.info('  npx gennady orient --file=index.ts --json     Versioned ownership JSON');
  console.info('  npx gennady orient --task=ORI-command          Files by task (S2)');
  console.info('  npx gennady orient --graph                Dependency graph (S7)');
  console.info('  npx gennady orient contract               Keyword search (S4)');
  console.info('  npx gennady orient --specs                Specs overview (S8)');
}
