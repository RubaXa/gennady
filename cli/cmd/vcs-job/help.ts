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
    '  npx gennady vcs-job --url <mr-url> --job <name|id> [--action status|play|cancel|retry]'
  );
  console.info('');
  console.info('Options:');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --job <name|id>          Job name or numeric id');
  console.info('  --action <action>        status (default), play, cancel, retry');
  console.info('  --host <hostname>        GitLab host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print what would be done without calling API');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-job --url https://gitlab.example.com/group/repo/-/merge_requests/42 --job lint'
  );
  console.info(
    '  npx gennady vcs-job --url https://gitlab.example.com/group/repo/-/merge_requests/42 --job 12345 --action play'
  );
  console.info(
    '  npx gennady vcs-job --url https://gitlab.example.com/group/repo/-/merge_requests/42 --job lint --action retry'
  );
}
