// @file: vcs-pipeline command help output.
// @consumers: help command
// @tasks: TSK-83

/**
 * @purpose Print CLI help for the vcs-pipeline command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-pipeline — Show MR pipeline status and failed jobs');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-pipeline --ref <ref> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   Explicit MR ref (overrides branch auto-detect)');
  console.info('  --host <hostname>        GitLab host (else from origin)');
  console.info('  --dry-run, --dry         Print what would be fetched without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-pipeline --ref group/repo!42');
  console.info('  npx gennady vcs-pipeline --ref group/repo!42 --dry-run');
}
