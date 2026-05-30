/**
 * @purpose Print CLI help for the lint command.
 */
export function printHelp(): void {
  console.info('gennady lint — Validate TypeScript files for codebase conventions');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady lint [paths...] [options]');
  console.info('');
  console.info('Options:');
  console.info('  --autofix           Auto-fix DbC contract issues where possible');
  console.info(
    '  --staged            Lint only staged and untracked .ts files (mutually exclusive with paths)'
  );
  console.info('  --verbose, -v       Enable debug logging output');
  console.info('  --max-invariants <n>  Max invariants per exported entity (default: 3)');
  console.info('  --exclude <glob>      Exclude files matching glob pattern (repeatable)');
  console.info('');
  console.info('  Default exclude patterns (always active):');
  console.info('    **/node_modules/**  **/__tests__/**  **/fixtures/**');
  console.info('    **/dist/**          **/coverage/**   **/build/**  **/out/**');
  console.info('');
  console.info('  When no paths or --staged are provided, lints nothing.');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady lint ./src');
  console.info('  npx gennady lint --staged');
  console.info('  npx gennady lint ./src --autofix --verbose');
}
