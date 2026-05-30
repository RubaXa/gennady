/**
 * @purpose Print CLI help for the review command.
 */
export function printHelp(): void {
  console.info('gennady review — Review staged changes using AI models');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady review [options]');
  console.info('');
  console.info('Options:');
  console.info('  --branch, -b <ref>  Git diff target branch (default: origin/main)');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady review');
  console.info('  npx gennady review --branch=develop');
}
