// @file: vcs-discussions command help output.
// @consumers: help command
// @tasks: TSK-93

/**
 * @purpose Print CLI help for the vcs-discussions command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-discussions — Show GitLab MR discussions (human-readable)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-discussions --ref <group/repo!iid> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   MR ref');
  console.info('  --project <group/repo>   Explicit project path');
  console.info('  --iid <id>               MR internal ID');
  console.info('  --all                    Include resolved discussions');
  console.info('  --json                   Machine-readable JSON output');
  console.info('  --host <hostname>        GitLab host');
  console.info('  --dry-run, --dry         Print without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-discussions --ref group/repo!42');
  console.info('  npx gennady vcs-discussions --ref group/repo!42 --all');
  console.info('  npx gennady vcs-discussions --ref group/repo!42 --json');
}
