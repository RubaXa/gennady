// @file: fix command help output
// @consumers: fix.cmd.ts, gennady.ts
// @tasks: TSK-96

/**
 * @purpose Print CLI help for the fix command.
 */
export function printHelp(): void {
  console.info(
    'gennady fix — run mutating fixers in the working tree (the explicit counterpart of verify)'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady fix [stack:id | id ...] [options]');
  console.info('');
  console.info(
    'Fixers are declared as the `fixer` field of their own gate — in a plugin, or on an\n' +
      '  `overrideGates`/`extraGates` entry in gennady.yaml. There is no `fixers` section.'
  );
  console.info('They run sequentially and stop on the first failure — they mutate one tree.');
  console.info('');
  console.info('Options:');
  console.info(
    '  --all                 Widen the scope to the whole repository (default: changed)'
  );
  console.info('  --root=<path>         Repository root (default: cwd)');
  console.info('  --help, -h            Show this help');
  console.info('');
  console.info('The verify↔fix loop for code generation (spec §4.4):');
  console.info('  gennady verify        → golang:generate FAILs with the drifted file list');
  console.info('  gennady fix golang:generate   → materializes generated code in your tree');
  console.info('  (naming a fixer runs it repo-wide — an explicit request ignores changed scope)');
  console.info('  git add / commit      → gennady verify is green again');
}
