// @file: lint command help output
// @consumers: help command
// @tasks: TSK-12, TSK-13, TSK-14, TSK-15, TSK-16
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
    '  --include-tests     Include __tests__ files; fixtures/mocks/configs stay excluded'
  );
  console.info(
    '                      With --spec, test targets get normal code rules but do not participate in production Entity Inventory'
  );
  console.info(
    '  --staged            Lint existing staged ACMR + untracked .ts/.tsx files; staged deletions are ignored (mutually exclusive with paths)'
  );
  console.info('  --verbose, -v       Enable debug logging output');
  console.info('  --max-invariants <n>  Max invariants per exported entity (default: 3)');
  console.info(
    '  --max-words <n>       Legacy/global semantic prose-word override for both categories'
  );
  console.info('  --max-header-words <n>   File-header prose limit (default: 24)');
  console.info('  --max-contract-words <n> JSDoc contract prose limit (default: 30)');
  console.info('                           Typed override > --max-words > typed default');
  console.info('  --max-region-comments <n>  Max comment lines per #region block (default: 3)');
  console.info('  --exclude <glob>      Exclude files matching glob pattern (repeatable)');
  console.info(
    '  --include-all         Lint configs/fixtures/mocks/__tests__ too (off by default)'
  );
  console.info(
    '  --spec=<module-spec>  Check exports against a module spec Entity Inventory (undeclared exports)'
  );
  console.info(
    '  --inventory-reverse <dir>  With --spec: also flag inventory entities exported by no file under <dir>'
  );
  console.info('');
  console.info('  Default exclude patterns:');
  console.info('    always:            **/node_modules/**  **/dist/**  **/coverage/**');
  console.info('                       **/build/**  **/out/**');
  console.info('    unless --include-all: **/__tests__/**  **/fixtures/**  **/__fixtures__/**');
  console.info('                       **/*.fixture.*  **/*.mock.*  **/*.config.*');
  console.info('');
  console.info('  When no paths or --staged are provided, lints nothing.');
  console.info('  Every option is accepted at most once, except repeatable --exclude.');
  console.info('  Numeric domains: max-invariants/word limits >= 1; region comments >= 0.');
  console.info('  Bad/missing/repeated option values stop before linting with exit 4 + usage.');
  console.info(
    '  Explicit symlink files/directories and symlinked .ts/.tsx files inside a selected directory fail closed with ERR_CLI_LINT_READ_FAILED.'
  );
  console.info(
    '  Nested symlink directories and unsupported-extension symlinks are not traversed because they are outside the implemented lint source set.'
  );
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady lint ./src');
  console.info('  npx gennady lint --staged');
  console.info('  npx gennady lint ./src --autofix --verbose');
}
