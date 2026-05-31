// @file: cat command help output
// @consumers: help command
// @tasks: TSK-31
/**
 * @purpose Print CLI help for the cat command.
 */
export function printHelp(): void {
  console.info('gennady cat — Display file contents as XML or Markdown');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady cat <path/glob>... [options]');
  console.info('  npx gennady cat --url=<MR/PR URL> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --plain             Suppress hint footer and color output');
  console.info('  --exclude, -e <g>   Glob pattern to exclude files');
  console.info('  --ext <exts>        Comma-separated file extensions to include');
  console.info('  --output, -o <fmt>  Output format: xml (default) or md');
  console.info('  --url <URL>         Fetch files from MR/PR URL instead of local paths');
  console.info('');
  console.info('  Note: --url and positional paths are mutually exclusive.');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady cat "./src/**/*.ts"');
  console.info('  npx gennady cat "./src/**/*.ts" --output=md --plain | pbcopy');
  console.info('  npx gennady cat --url="https://gitlab.com/.../-/merge_requests/123"');
}
