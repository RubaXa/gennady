// @file: vcs-job-log command help output.
// @consumers: help command
// @tasks: TSK-85

/**
 * @purpose Print CLI help for the vcs-job-log command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-job-log — Print raw trace/log of a pipeline job');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-job-log --ref <ref> --job <name|id>');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   Explicit MR ref');
  console.info('  --job <name|id>          Job name or numeric id');
  console.info('  --host <hostname>        GitLab host (else from origin)');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-job-log --ref group/repo!42 --job lint');
  console.info('  npx gennady vcs-job-log --ref group/repo!42 --job 12345');
}
