// @file: review-verify command help output
// @consumers: help command
// @tasks: TSK-0 (legacy — no task ticket)
/**
 * @purpose Print CLI help for the review-verify command.
 */
export function printHelp(): void {
  console.info('gennady review-verify — Build verification prompt from MR/PR');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady review-verify [URL | !ref] [options]');
  console.info('');
  console.info('Options:');
  console.info('  --branch, -b <ref>  Git diff target branch');
  console.info('  --url <URL>         GitLab MR or GitHub PR URL');
  console.info('  --ref <ref>         MR/PR reference (supports ! prefix)');
  console.info('  --project <name>    VCS project path (e.g. "group/repo")');
  console.info('  --iid <id>          MR internal ID');
  console.info('  --all               Include all discussions, not only unresolved');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady review-verify --url="https://gitlab.com/g/name/-/merge_requests/42"');
  console.info('  npx gennady review-verify https://github.com/owner/repo/pull/10');
  console.info('  npx gennady review-verify --branch=develop "https://..."');
}
