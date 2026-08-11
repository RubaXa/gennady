// @file: yagni command help output
// @consumers: yagni.cmd
// @tasks: N/A

/**
 * @purpose Print CLI help for the yagni command.
 */
export function printHelp(): void {
  console.info('gennady yagni — flag added/changed symbols with fewer than 2 production-code usages');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady yagni [root]');
  console.info('');
  console.info('What it does:');
  console.info('  1. Collects symbols added or changed vs HEAD (exports, class/interface members,');
  console.info('     internal top-level declarations) in every changed source file.');
  console.info('  2. Counts each symbol’s production-code references across the whole repo —');
  console.info('     test files never count as usage; barrel re-exports never count as usage.');
  console.info('  3. < 2 usages → finding, UNLESS its contract carries a Usage Waiver with a reason:');
  console.info('       - **Usage Waiver:** <reason>');
  console.info('     Cite a D-NNN only when a Decision Log entry backs the reason:');
  console.info('       - **Usage Waiver:** D-NNN — <reason>');
  console.info('     A cited D-NNN must have a Decision Log heading somewhere in specs/.');
  console.info('');
  console.info('Symbol resolution: tree-sitter (exact) for .ts/.tsx — the only installed grammar —');
  console.info('  grep (approximate) for every other extension, so non-TS languages (Go, Python, ...)');
  console.info('  still get a usage estimate.');
  console.info('');
  console.info('Exit code: 0 when clean, 1 when any finding is reported.');
  console.info('');
  console.info('Options:');
  console.info('  --help, -h            Show this help');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady yagni');
  console.info('  npx gennady yagni .');
}
