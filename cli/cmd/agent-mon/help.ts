// @file: agent-mon command help output
// @consumers: help command
// @tasks: TSK-0 (legacy — no task ticket)
/**
 * @purpose Print CLI help for the agent-mon command.
 */
export function printHelp(): void {
  console.info(
    'gennady agent-mon — Interactive terminal dashboard for monitoring AI agent sessions'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady agent-mon [options]');
  console.info('');
  console.info('Options:');
  console.info('  --once             Snapshot mode — print dashboard and exit');
  console.info('  --interval <ms>    Polling interval in ms (default: 5000)');
  console.info('  --provider <name>  Filter by provider: claude, opencode, all (default: all)');
  console.info('  --view <name>      Dashboard layout: column (default), compact');
  console.info('  --limit <N>        Max sessions per provider (default: 10)');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady agent-mon');
  console.info('  npx gennady agent-mon --once');
  console.info('  npx gennady agent-mon --provider=claude --limit=5');
}
