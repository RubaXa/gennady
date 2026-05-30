/**
 * @purpose Print CLI help for the review-issues command.
 */
export function printHelp(): void {
  console.info('gennady review-issues — Build XML issues artifact from MR/PR discussions');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady review-issues [URL | !ref] [options]');
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
  console.info('  npx gennady review-issues --url="https://gitlab.com/g/name/-/merge_requests/42"');
  console.info('  npx gennady review-issues https://github.com/owner/repo/pull/10');
}
