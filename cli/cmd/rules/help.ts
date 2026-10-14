// @file: Public help for the read-only RuleRegistry/RuleSnapshot facade.
// @spec: CLI-RULES-CLI
// @consumers: gennady.ts

/** @purpose Print exact rules CLI usage without conflating it with agents-rules. */
export function printHelp(): void {
  console.info('gennady rules — inspect and resolve embedded agent rules without executing code');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady rules list [--format text|json]');
  console.info('  npx gennady rules show <rule-id> [--format text|json]');
  console.info(
    '  npx gennady rules resolve --phase <selector> (--files <path-or-glob>... | --changed-from <ref> | --task <ticket>) [--format text|json]'
  );
  console.info('');
  console.info('list is the complete deterministic inventory; it never filters by stack or phase.');
  console.info(
    'resolve requires exactly one explicit scope and returns one immutable snapshot digest.'
  );
  console.info('This command is read-only and separate from `gennady agents-rules`.');
}
