// @file: yagni command help output
// @consumers: yagni.cmd
// @tasks: N/A

/**
 * @purpose Print CLI help for the yagni command.
 */
export function printHelp(): void {
  console.info(
    'gennady yagni — flag added/changed symbols with fewer than 2 production-code usages'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady yagni [root]');
  console.info('');
  console.info('What it does:');
  console.info('  1. Collects symbols added or changed vs HEAD (exports, class/interface members,');
  console.info('     internal top-level declarations) in every changed source file.');
  console.info('  2. Counts each symbol’s production-code references across the whole repo —');
  console.info('     test files never count as usage; barrel re-exports never count as usage.');
  console.info(
    '  3. < 2 usages → finding, UNLESS its contract carries a Usage Waiver with a reason:'
  );
  console.info('       - **Usage Waiver:** <reason>');
  console.info('     Cite an <ACR>-DL-N only when a Decision Log entry backs the reason:');
  console.info('       - **Usage Waiver:** <ACR>-DL-N — <reason>');
  console.info('     A cited id must have a Decision Log heading somewhere in specs/.');
  console.info('');
  console.info(
    'Symbol resolution: tree-sitter (exact) for .ts/.tsx — the only installed grammar —'
  );
  console.info('  grep (approximate) for .mts/.cts, JS variants, Python, Go, Ruby, and Java;');
  console.info('  supported source extensions: ts/tsx/mts/cts/js/jsx/mjs/cjs/py/go/rb/java.');
  console.info('  Visibility is structural for TypeScript and language-defined for Go (uppercase');
  console.info('  top-level name = public). Other grep fallbacks report an explicit capability');
  console.info('  error when one usage makes the public/private threshold ambiguous.');
  console.info('');
  console.info('Git scope: HEAD diff + untracked files. In a valid repo without HEAD,');
  console.info(
    '  the baseline is the empty tree and every cached/untracked source file is analyzed.'
  );
  console.info('  A non-git/corrupt root fails closed; it is never reported clean.');
  console.info(
    '  An unreadable production/spec corpus path also fails closed with its path/reason;'
  );
  console.info('  partial counts or waiver evidence are never evaluated.');
  console.info('');
  console.info(
    'Exit code: 0 clean, 1 findings, 2 invalid/unavailable root or Git scope, 4 bad argv.'
  );
  console.info('');
  console.info('Options:');
  console.info('  --help, -h            Show this help');
  console.info('  Invalid/unknown arguments print canonical usage.');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady yagni');
  console.info('  npx gennady yagni .');
}
