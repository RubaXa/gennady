// @file: vcs-job-log command help output.
// @consumers: help command
// @tasks: TSK-85

/**
 * @purpose Print CLI help for the vcs-job-log command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-job-log — Print filtered trace/log of a pipeline job');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-job-log --url <mr-url> --job <name|id> [--raw]');
  console.info('');
  console.info('Options:');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --job <name|id>          Job name or numeric id');
  console.info('  --host <hostname>        GitLab host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --raw                    Unfiltered raw output (default: structural filter)');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-job-log --url https://gitlab.example.com/group/repo/-/merge_requests/42 --job lint'
  );
  console.info(
    '  npx gennady vcs-job-log --url https://gitlab.example.com/group/repo/-/merge_requests/42 --job lint --raw'
  );
}
