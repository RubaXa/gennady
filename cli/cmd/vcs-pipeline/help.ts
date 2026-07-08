// @file: vcs-pipeline command help output.
// @consumers: help command
// @tasks: TSK-83

/**
 * @purpose Print CLI help for the vcs-pipeline command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-pipeline — Show MR pipeline status and job results');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-pipeline --url <mr-url> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --host <hostname>        GitLab host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --all                    Show all jobs (default: failed only)');
  console.info('  --status <status>        Filter by job status (failed, success, running, ...)');
  console.info('  --logs                   Show filtered job logs');
  console.info('  --json                   Machine-readable JSON output');
  console.info('  --dry-run, --dry         Print what would be fetched without calling API');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-pipeline --url https://gitlab.example.com/group/repo/-/merge_requests/42'
  );
  console.info(
    '  npx gennady vcs-pipeline --url https://gitlab.example.com/group/repo/-/merge_requests/42 --all --logs'
  );
  console.info(
    '  npx gennady vcs-pipeline --url https://gitlab.example.com/group/repo/-/merge_requests/42 --status running'
  );
}
