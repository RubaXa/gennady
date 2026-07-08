// @file: vcs-diff command help output.
// @consumers: help command
// @tasks: TSK-81

/**
 * @purpose Print CLI help for the vcs-diff command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-diff — List MR changed files or show file content');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-diff --url <mr-url> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --path <file>            Show file content at MR head (filters changes)');
  console.info('  --host <hostname>        GitLab host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print what would be fetched without calling API');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-diff --url https://gitlab.example.com/group/repo/-/merge_requests/42'
  );
  console.info(
    '  npx gennady vcs-diff --url https://gitlab.example.com/group/repo/-/merge_requests/42 --path src/foo.ts'
  );
}
