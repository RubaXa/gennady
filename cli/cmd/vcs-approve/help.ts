// @file: vcs-approve command help output.
// @consumers: help command
// @tasks: TSK-69

/**
 * @purpose Print CLI help for the vcs-approve command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-approve — Approve a GitLab MR via API');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-approve [options]');
  console.info('');
  console.info('Options:');
  console.info('  --ref <group/repo!iid>   Explicit MR ref (overrides branch auto-detect)');
  console.info('  --project <group/repo>   Explicit project path');
  console.info('  --iid <id>               Merge request internal ID');
  console.info('  --branch <name>          Override auto-detected branch');
  console.info('  --host <hostname>        GitLab host (else from origin)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('  --dry-run, --dry         Print what would be sent without calling API');
  console.info('  --revoke, --unapprove    Remove previous approval');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN    GitLab access token (required)');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-approve                                      # auto-detect → approve'
  );
  console.info(
    '  npx gennady vcs-approve --ref group/repo!99 --revoke            # remove approval'
  );
  console.info('  npx gennady vcs-approve --project group/repo --iid 42        # project + iid');
  console.info('  npx gennady vcs-approve --dry-run                            # dry-run');
  console.info('  npx gennady vcs-approve --host gitlab.internal.company.com   # self-hosted');
}
