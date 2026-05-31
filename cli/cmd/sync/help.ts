// @file: sync command help output
// @consumers: help command
/**
 * @purpose Print CLI help for the sync command.
 */
export function printHelp(): void {
  console.info('gennady sync — Synchronize ai/directives/ from npm package into current project');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sync [subdirs...] [options]');
  console.info('');
  console.info('Options:');
  console.info('  --dry-run           Preview changes without writing files');
  console.info('');
  console.info('  Specify subdirectories to sync only those parts of ai/directives/.');
  console.info('  Requires gennady as a local dev dependency (npm i -D gennady).');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady sync');
  console.info('  npx gennady sync --dry-run');
  console.info('  npx gennady sync ts-patterns typescript --dry-run');
}
