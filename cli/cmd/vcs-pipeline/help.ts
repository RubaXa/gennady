// @file: vcs-pipeline command help output.
// @consumers: help command
// @tasks: TSK-83

/**
 * @purpose Print CLI help for the vcs-pipeline command.
 * @sideEffect Console: writes help text to stdout.
 */
export function printHelp(): void {
  console.info('gennady vcs-pipeline — Show pipeline status, metadata and job results');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady vcs-pipeline --url <mr-url> [options]');
  console.info('  npx gennady vcs-pipeline --branch <name> [options]');
  console.info('  npx gennady vcs-pipeline --list [--branch <name>] [options]');
  console.info('');
  console.info('Target (pick one):');
  console.info('  --url <mr-url>           MR/PR URL — host inferred, no guessing (preferred)');
  console.info('  --ref <group/repo!iid>   MR ref (override; needs --host)');
  console.info('  --project <group/repo>   Project for --branch/--sha/--list — no MR required');
  console.info('  --branch <name>          Pipelines by branch/tag — no MR required');
  console.info('  --sha <sha>              Pipelines by commit SHA — no MR required');
  console.info('  (no target)              Auto-detect MR of the current git branch');
  console.info('');
  console.info('Options:');
  console.info('  --list                   List recent pipelines (newest first)');
  console.info('  --limit <n>              Max pipelines in --list (default: 10)');
  console.info('  --watch, --until-done    Poll until a terminal status; exit 1 when failed');
  console.info('  --interval <sec>         Watch poll interval (default: 15)');
  console.info('  --timeout <sec>          Watch timeout (default: 1800)');
  console.info('  --all                    Show all jobs (default: failed only)');
  console.info('  --status <status>        Filter by job status (failed, success, running, ...)');
  console.info('  --logs                   Show filtered job logs');
  console.info('  --test <substring>       With --logs: only blocks of the matching test');
  console.info('  --json                   Machine-readable JSON output');
  console.info('  --dry-run, --dry         Print what would be fetched without calling API');
  console.info('  --host <hostname>        GitLab host (only with --ref)');
  console.info('  --vcs-host <hostname>    Alias for --host');
  console.info('');
  console.info('Examples:');
  console.info(
    '  npx gennady vcs-pipeline --url https://gitlab.example.com/group/repo/-/merge_requests/42'
  );
  console.info('  npx gennady vcs-pipeline --project group/repo --list --branch master --limit 5');
  console.info('  npx gennady vcs-pipeline --project group/repo --branch master --watch');
  console.info(
    '  npx gennady vcs-pipeline --url https://gitlab.example.com/group/repo/-/merge_requests/42 --all --logs'
  );
  console.info(
    '  npx gennady vcs-pipeline --url https://gitlab.example.com/group/repo/-/merge_requests/42 --logs --test "rate-limit"'
  );
}
