// @file: resolve-conflicts command help output
// @consumers: help command
// @tasks: TSK-0 (legacy — no task ticket)
/**
 * @purpose Print CLI help for the resolve-conflicts command.
 */
export function printHelp(): void {
  console.info(
    'gennady resolve-conflicts — Build confidence-aware merge-conflict resolution prompt'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady resolve-conflicts [options]');
  console.info('');
  console.info('Options:');
  console.info('  --branch, -b <ref>  Target branch for merge (default: origin/main)');
  console.info('  --incoming <ref>    Incoming branch being merged');
  console.info('');
  console.info('  Requires an active git merge with conflicts present.');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady resolve-conflicts');
  console.info('  npx gennady resolve-conflicts --branch=main --incoming=feature/x');
}
