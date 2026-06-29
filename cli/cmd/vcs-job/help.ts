// @file: vcs-job command help output.
// @consumers: help command
// @tasks: TSK-85

/**
 * @purpose Print CLI help for the vcs-job command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-job — Inspect or control a pipeline job');
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx gennady vcs-job --ref <ref> --job <name|id> [--action status|play|cancel|retry]'
  );
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   Explicit MR ref');
  console.info('  --job <name|id>          Job name or numeric id');
  console.info('  --action <action>        status (default), play, cancel, retry');
  console.info('  --host <hostname>        GitLab host (else from origin)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print what would be done without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-job --ref group/repo!42 --job lint');
  console.info('  npx gennady vcs-job --ref group/repo!42 --job 12345 --action play');
  console.info('  npx gennady vcs-job --ref group/repo!42 --job lint --action retry');
}
