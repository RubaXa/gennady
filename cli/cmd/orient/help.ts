// @file: Help output for the gennady orient command.
// @consumers: gennady.ts
// @tasks: TSK-55

/**
 * @purpose Print help text for the gennady orient command.
 * @sideEffect Console: writes usage, options, and examples to stdout.
 */
export function printHelp(): void {
  console.info('gennady orient — Navigate project structure via file headers and DBC contracts');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady orient [options] [keyword]');
  console.info('');
  console.info('Options:');
  console.info('  --file=<path>       Show detailed view of a specific file (repeatable)');
  console.info('  --dir=<path>        Limit scanning to a directory');
  console.info('  --task=<TSK-NN>     Find files by task ID (repeatable)');
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
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady orient                        Project map (S1)');
  console.info('  npx gennady orient --file=index.ts        Detailed file view (S5)');
  console.info('  npx gennady orient --task=TSK-55          Files by task (S2)');
  console.info('  npx gennady orient --graph                Dependency graph (S7)');
  console.info('  npx gennady orient contract               Keyword search (S4)');
  console.info('  npx gennady orient --specs                Specs overview (S8)');
}
