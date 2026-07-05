// @file: inbox config command help output.
// @consumers: gennady.ts
// @tasks: TSK-92

/** @purpose Print CLI help for the inbox config command. */
export function printHelp(): void {
  console.info('gennady inbox config — Manage agent-inbox configuration');
  console.info('');
  console.info('Usage:');
  console.info('  gennady inbox config [options]');
  console.info('');
  console.info('Options:');
  console.info('  --set <key>=<value>   Set config key (reposBase, vcsHost)');
  console.info('  --unset <key>         Remove config key');
  console.info('  --path                Print absolute path to config.json');
  console.info('  --init                Interactive configuration wizard');
  console.info('  --help                Show this help');
  console.info('  --state-dir <dir>     State directory (default ~/.gennady)');
  console.info('');
  console.info('Without options, prints current config as JSON.');
  console.info('If not configured, prints {"configured": false}.');
}
