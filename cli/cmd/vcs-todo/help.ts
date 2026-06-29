// @file: vcs-todo command help output
// @consumers: help command

/**
 * @purpose Print CLI help for the vcs-todo command.
 */
export function printHelp(): void {
  console.info('gennady vcs-todo — Mark MR-related todos as done');
  console.info('');
  console.info('Close todos associated with a merge request through Inbox.markTodoDone.');
  console.info('');
  console.info('Usage:');
  console.info('  npx tsx cli/gennady.ts vcs-todo --done <ref>');
  console.info('  npx tsx cli/gennady.ts vcs-todo --id <todoId>');
  console.info('');
  console.info('Options:');
  console.info('  --done <ref>          Mark all todos for the given MR done (group/project!iid)');
  console.info('  --id <todoId>         Mark a specific todo done directly');
  console.info('  --dry-run             Print would-mark messages without executing the mutation');
  console.info(
    '  --vcs-host=<host>     GitLab host, disables origin autodetect (e.g. gitlab.example.com)'
  );
  console.info('');
  console.info('Examples:');
  console.info('  gennady vcs-todo --done group/repo!42');
  console.info('  gennady vcs-todo --id gid://gitlab/Todo/123');
  console.info('  gennady vcs-todo --done group/repo!42 --dry-run');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN  GitLab token (read_api scope) — the only env var');
}
