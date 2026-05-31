// @file: commit command help output
// @consumers: help command
// @tasks: TSK-0 (legacy — no task ticket)
/**
 * @purpose Print CLI help for the commit command.
 */
export function printHelp(): void {
  console.info('gennady commit — Generate commit message from staged changes');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady commit [options]');
  console.info('');
  console.info('Options:');
  console.info('  --apply             Apply generated commit message via git commit -am');
  console.info('  --mode, -m <mode>   Commit style: auto, oneline, detailed (default: auto)');
  console.info('  --oneline, -o       Shorthand for --mode=oneline');
  console.info('  --model <model>     AI model to use (reads from rc config by default)');
  console.info('  --branch, -b <ref>  Git diff target branch (default: origin/main)');
  console.info('  --api, --apiUrl <u> Override AI API endpoint URL');
  console.info('  --task, -t <desc>   Task description for commit context');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady commit');
  console.info('  npx gennady commit --mode=oneline');
  console.info('  npx gennady commit --apply --mode=detailed');
}
