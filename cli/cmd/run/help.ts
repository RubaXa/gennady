// @file: run command help output
// @consumers: help command
// @tasks: TSK-65
/**
 * @purpose Print CLI help for the run command.
 */
export function printHelp(): void {
  console.info('gennady run — Run a task via an external AI agent engine (opencode) in readonly mode');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady run "<task>" [options]');
  console.info('');
  console.info('Arguments:');
  console.info('  <task>              The task/prompt text for the agent (required)');
  console.info('');
  console.info('Options:');
  console.info('  --dir <path>        Working directory; repeatable for several repos/folders');
  console.info('                      (default: current directory)');
  console.info('  --model <prov/model>  Model to use, e.g. llm-proxy/deepseek-v4-pro');
  console.info('                      (default: the engine default; unavailable → MODEL_UNAVAILABLE + list)');
  console.info('  --engine <id>       Engine to use (default: opencode, the first installed)');
  console.info('  --timeout <ms>      Hard time limit for one run in ms (default: 1800000 = 30 min)');
  console.info('  --help, -h          Show this help');
  console.info('');
  console.info('Behavior:');
  console.info('  readonly — the agent may read, search and run shell, but must not edit files (v1).');
  console.info('  Output: the agent\'s Markdown answer on stdout, exit 0.');
  console.info('  On failure: "✗ <hint>   [<CODE>]" on stderr, exit 1.');
  console.info('  Error codes: AGENT_NOT_INSTALLED, NETWORK_BLOCKED, VERSION_MISMATCH,');
  console.info('               MODEL_FORBIDDEN, MODEL_UNAVAILABLE, CREDENTIAL_MISSING, TIMEOUT, LAUNCH_FAILED.');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady run "describe this repository in one sentence"');
  console.info('  npx gennady run "how are these repos related?" --dir ../repoA --dir ../repoB');
  console.info('  npx gennady run "review cli/cmd/run" --model llm-proxy/glm-4.7 --timeout 600000');
}
