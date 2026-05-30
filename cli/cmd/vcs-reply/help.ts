/**
 * @purpose Print CLI help for the vcs-reply command.
 */
export function printHelp(): void {
  console.info('gennady vcs-reply — Post replies to GitLab MR discussions');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-reply --project=<name> --iid=<id> [options]');
  console.info('');
  console.info('  Reads a JSON array of discussion replies from stdin.');
  console.info('');
  console.info('Options:');
  console.info('  --project <name>    GitLab project path (e.g. "group/repo")');
  console.info('  --iid <id>          Merge request internal ID');
  console.info('  --dry-run, --dry    Print what would be sent without posting');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN   GitLab access token (required)');
  console.info('  GITLAB_API_PATH         API path override (default: /api/v4)');
  console.info('');
  console.info('Examples:');
  console.info(
    '  echo \'[{"discussionId":"abc","body":"reviewed"}]\' | npx gennady vcs-reply --project=my/repo --iid=42'
  );
  console.info('  npx gennady vcs-reply --project=my/repo --iid=42 --dry-run < replies.json');
}
