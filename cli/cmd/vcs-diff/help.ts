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
  console.info('  npx gennady vcs-diff --ref <ref> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   Explicit MR ref (overrides branch auto-detect)');
  console.info('  --path <file>            Show file content at MR head (filters changes)');
  console.info('  --host <hostname>        GitLab host (else from origin)');
  console.info('  --dry-run, --dry         Print what would be fetched without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-diff --ref group/repo!42');
  console.info('  npx gennady vcs-diff --ref group/repo!42 --path src/foo.ts');
  console.info('  npx gennady vcs-diff --ref group/repo!42 --dry-run');
}
