// @file: vcs-mr-edit command help output.
// @consumers: help command
// @tasks: TSK-92

/**
 * @purpose Print CLI help for the vcs-mr-edit command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-mr-edit — Edit a GitLab MR (title, draft/ready, labels, assignee)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-mr-edit --ref <group/repo!iid> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   MR ref');
  console.info('  --project <group/repo>   Explicit project path');
  console.info('  --iid <id>               MR internal ID');
  console.info('  --title <text>           New title');
  console.info('  --description <text>     New description');
  console.info('  --draft                  Mark as draft');
  console.info('  --ready                  Mark as ready (un-draft)');
  console.info('  --label <name>           Add label (repeatable)');
  console.info('  --unlabel <name>         Remove label (repeatable)');
  console.info('  --target-branch <name>   Change target branch');
  console.info('  --assignee <id>          Assignee user ID');
  console.info('  --reviewer <id>          Reviewer user ID');
  console.info('  --milestone <id>         Milestone ID');
  console.info('  --host <hostname>        GitLab host');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print without calling API');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady vcs-mr-edit --ref group/repo!42 --title "Better title"');
  console.info('  npx gennady vcs-mr-edit --ref group/repo!42 --ready');
  console.info('  npx gennady vcs-mr-edit --ref group/repo!42 --label bug --unlabel wip');
}
