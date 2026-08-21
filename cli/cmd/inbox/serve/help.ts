// @file: inbox serve command help output
// @consumers: help command, gennady.ts per-command help
// @tasks: TSK-115

/**
 * @purpose Print CLI help for the `gennady inbox serve` command.
 */
export function printHelp(): void {
  console.info('gennady inbox serve — Start the agent-inbox server');
  console.info('');
  console.info('Starts an HTTP server (default port 4174) with the inbox dashboard');
  console.info('and API. In production mode, connects to real VCS (GitLab/GitHub) and');
  console.info('OpenCode AI engine. In --mocks mode, uses in-memory adapters for dev/e2e.');
  console.info('');
  console.info('Usage:');
  console.info('  npx tsx cli/gennady.ts inbox serve [options]');
  console.info('');
  console.info('Options:');
  console.info('  --mocks              Use mock VCS + mock OpenCode (dev/e2e mode)');
  console.info(
    '  --mock-opencode      Keep real GitLab/worktrees but substitute only OpenCode (explicit test mode)'
  );
  console.info('  --no-auto-review      Serve real state without dispatching discovered reviews');
  console.info(
    '  --auto-review-quiet-minutes=<N>  Override the post-commit auto-review delay (default: 15)'
  );
  console.info(
    '  --opencode-model=<provider/model>  Pin the review model (default: llm-proxy/deepseek-v4-pro)'
  );
  console.info('  --port=<N>           HTTP port (default: 4174)');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady inbox serve --mocks');
  console.info('  npx gennady inbox serve --mocks --port=4175');
  console.info('  npx gennady inbox serve');
  console.info('');
  console.info('Startup sequence:');
  console.info('  1. Check config (~/.gennady/agent-inbox/config.json)');
  console.info('  2. Create VCS adapter (mock or real)');
  console.info('  3. Check OpenCode availability (PATH + health check ×3)');
  console.info('  4. Load and activate roles');
  console.info('  5. Start HTTP server on the configured port');
  console.info('');
  console.info('Environment:');
  console.info('  GITLAB_PERSONAL_TOKEN  GitLab token (required for production mode)');
  console.info('');
  console.info('Signals:');
  console.info('  SIGTERM / SIGINT  Graceful shutdown — stop server, clean up sessions');
}
