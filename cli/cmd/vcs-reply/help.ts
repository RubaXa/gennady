// @file: vcs-reply command help output
// @consumers: help command
/**
 * @purpose Print CLI help for the vcs-reply command.
 */
export function printHelp(): void {
  console.info('gennady vcs-reply — Post comments to GitLab MR discussions');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-reply --project=<name> --iid=<id> [options]');
  console.info('');
  console.info('  Reads a JSON array of items from stdin. Each item is one of:');
  console.info('   - reply:      {"discussionId":"<id>","body":"..."}');
  console.info('   - discussion: {"body":"..."}                       (new general thread)');
  console.info('   - line:       {"body":"...","position":{"baseSha","startSha","headSha",');
  console.info('                  "newPath","newLine"|"oldLine"}}      (comment on a diff line)');
  console.info('');
  console.info('  Line position rules (GitLab):');
  console.info('   - baseSha/startSha/headSha = MR diff_refs (gennady vcs-worktree prints them)');
  console.info('   - added line   → newLine set, oldLine omitted');
  console.info('   - removed line → oldLine set, newLine omitted');
  console.info('   - context line → BOTH newLine and oldLine required');
  console.info('');
  console.info('Options:');
  console.info('  --project <name>     GitLab project path (e.g. "group/repo")');
  console.info('  --iid <id>           Merge request internal ID');
  console.info('  --vcs-source=<host>  GitLab host (else from origin of the current repo)');
  console.info('  --dry-run, --dry     Print what would be sent without posting');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN   GitLab access token (required) — the only env var');
  console.info('');
  console.info('Examples:');
  console.info(
    '  echo \'[{"discussionId":"abc","body":"reviewed"}]\' | npx gennady vcs-reply --project=my/repo --iid=42'
  );
  console.info('  npx gennady vcs-reply --project=my/repo --iid=42 --dry-run < replies.json');
}
