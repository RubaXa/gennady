// @file: vcs-worktree command help output
// @consumers: help command
/**
 * @purpose Print CLI help for the vcs-worktree command.
 */
export function printHelp(): void {
  console.info('gennady vcs-worktree — Prepare a read-only git worktree for MR review');
  console.info('');
  console.info('Locates the local clone (repos.json → ~/Developer scan → shallow clone),');
  console.info('fetches the MR head, adds a detached worktree with hooks disabled. Read-only:');
  console.info('nothing from the MR is executed.');
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx tsx cli/gennady.ts vcs-worktree --ref group/project!iid [--vcs-source=<host>]'
  );
  console.info('  npx tsx cli/gennady.ts vcs-worktree --cleanup <worktree-path>');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN  GitLab token');
  console.info('  GENNADY_REPOS_BASE     Base dir to scan for clones (default ~/Developer)');
  console.info('  GENNADY_REPOS_MAP      repos.json override (default ~/.gennady/repos.json)');
}
