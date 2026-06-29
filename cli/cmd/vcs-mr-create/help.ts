// @file: vcs-mr-create command help output.
// @consumers: help command
// @tasks: TSK-91

/**
 * @purpose Print CLI help for the vcs-mr-create command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-mr-create — Create a GitLab MR from the current branch');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-mr-create --title <text> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --title <text>           MR title (required)');
  console.info('  --description <text>     MR description in Markdown');
  console.info('  --target-branch <name>   Target branch (default: auto-detect or main)');
  console.info('  --draft                  Create as draft MR');
  console.info('  --label <name>           Add label (repeatable)');
  console.info('  --assignee <id>          Assignee user ID');
  console.info('  --reviewer <id>          Reviewer user ID');
  console.info('  --milestone <id>         Milestone ID');
  console.info('  --host <hostname>        GitLab host (else from origin)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print what would be created without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-mr-create --title "Fix auth bug"');
  console.info('  npx gennady vcs-mr-create --title "Feature X" --draft --label backend');
  console.info('  npx gennady vcs-mr-create --title "Hotfix" --target-branch release --dry-run');
}
