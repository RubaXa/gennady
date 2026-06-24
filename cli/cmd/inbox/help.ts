// @file: inbox command help output
// @consumers: help command
/**
 * @purpose Print CLI help for the inbox command.
 */
export function printHelp(): void {
  console.info('gennady inbox — List merge requests awaiting your reaction');
  console.info('');
  console.info('Lists, in one GraphQL request, the MRs that need you: review');
  console.info('requested, mentioned, assigned, and your own open MRs.');
  console.info('');
  console.info('Usage:');
  console.info('  npx tsx cli/gennady.ts inbox [options]');
  console.info('');
  console.info('Options:');
  console.info(
    '  --vcs-source=<host>  GitLab host, disables origin autodetect (e.g. gitlab.example.com)'
  );
  console.info('  --drafts             Include draft MRs (hidden by default)');
  console.info('  --include-stale      Include stale review requests');
  console.info('  --stale-days=<N>     Days before a review request is stale (default 14)');
  console.info('  --ci-all             Show CI/state events for all roles, not only author');
  console.info('  --all                Disable stale/draft/event suppression (role filter stays)');
  console.info('  --no-save            Do not update the seen-registry (read-only run)');
  console.info('  --reset              Clear registry + drafts (~/.gennady/inbox-out) — clean slate');
  console.info(
    '  --pick <ref>         Work packet for one MR (group/project!iid): stage + open questions'
  );
  console.info('');
  console.info('Marks new / ↑updated MRs vs the previous run (registry in ~/.gennady).');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN  GitLab token (read_api scope is enough)');
  console.info('  GITLAB_API_PATH        Override REST base path (default /api/v4)');
  console.info('');
  console.info('Host is auto-detected from the origin remote of the current repo.');
}
