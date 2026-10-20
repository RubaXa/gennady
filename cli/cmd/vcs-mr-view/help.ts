// @file: vcs-mr-view command help output.
// @consumers: help command
// @tasks: TSK-99

/**
 * @purpose Print CLI help for the vcs-mr-view command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info(
    'gennady vcs-mr-view — Show MR metadata: title, description, reviewers, approvers, labels'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-mr-view --url <mr-url> [options]');
  console.info('');
  console.info('Target (pick one):');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --project <group/repo>   Explicit project path');
  console.info('  --iid <id>               MR internal ID');
  console.info('  (no target)              Auto-detect MR of the current git branch');
  console.info('');
  console.info('Options:');
  console.info('  --json                   Machine-readable JSON output');
  console.info('  --no-approvals           Skip the GitLab approvals endpoint request');
  console.info('  --no-description         Omit the MR description body');
  console.info('  --host <hostname>        GitLab host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print what would be fetched without calling API');
  console.info('');
  console.info('Shows: title, state, draft, author, assignees, reviewers, approvers, labels,');
  console.info('milestone, source→target branch, merge status, conflicts, notes/changes counts,');
  console.info('timestamps, web URL and description.');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-mr-view --url https://gitlab.example.com/group/repo/-/merge_requests/42'
  );
  console.info('  npx gennady vcs-mr-view --ref group/repo!42 --host gitlab.example.com --json');
}
