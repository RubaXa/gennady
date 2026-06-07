// @file: testcov command help output
// @consumers: testcov.cmd.ts
// @tasks: TSK-66
/**
 * @purpose Print CLI help for the testcov command.
 */
export function printHelp(): void {
  console.info(
    'gennady testcov — Visual test coverage tree for vitest / jest / node:test projects'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady testcov [path] [options]');
  console.info('');
  console.info('Options:');
  console.info('  --files               Show source files in tree (default: dirs only)');
  console.info('  --run                 Detect runner → run tests with coverage → show tree');
  console.info('  --check               Diagnose configuration; exit 0 if OK, 1 on errors');
  console.info('  --json                Machine-readable output (for --check or --flat)');
  console.info('  --flat                Flat list instead of tree');
  console.info('  --context, -c <N>     Context lines around uncovered code (default: 2)');
  console.info('  --color               Enable ANSI color highlighting (red/yellow backgrounds)');
  console.info('  --help, -h            Show this help');
  console.info('');
  console.info(
    'File detail: when a source file is targeted, shows line-by-line annotated coverage'
  );
  console.info('  npx gennady testcov src/module.ts           full annotated view');
  console.info('  npx gennady testcov src/module.ts -c 3      ±3 context lines around uncovered');
  console.info('');
  console.info('Supported runners (auto-detected from package.json):');
  console.info(
    "  vitest   — requires @vitest/coverage-v8, coverage.reporter: ['json'], reportOnFailure: true"
  );
  console.info("  jest     — requires coverageReporters: ['json']");
  console.info('  node:test — requires c8, npm script with node --test');
  console.info('');
  console.info('Tree format (--files):');
  console.info('  \u{1F4C1} folder — \u{2705} 87% (42 tests)');
  console.info('  \u{251C}\u{2500} \u{1F4C1} subfolder — \u{1F7E2} 68% (18 tests)');
  console.info(
    '  \u{2502}  \u{251C}\u{2500} \u{1F4C4} source.ts — \u{2705} 94%/88%/100%   (Statements/Branches/Functions)'
  );
  console.info('  \u{2502}  \u{2514}\u{2500} \u{1F4C4} other.ts \u26AB   (not instrumented)');
  console.info('');
  console.info(
    'Legend: \u2705 \u226575%   \u{1F7E2} \u226550%   \u{1F7E1} \u226525%   \u{1F7E0} >0%   \u{1F534} 0%   \u26AB not instrumented'
  );
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady testcov');
  console.info('  npx gennady testcov --files');
  console.info('  npx gennady testcov --run');
  console.info('  npx gennady testcov --check');
  console.info('  npx gennady testcov --check --json');
  console.info('  npx gennady testcov --flat --json');
  console.info('  npx gennady testcov src/core');
  console.info('  npx gennady testcov src/core --files');
  console.info('  npx gennady testcov src/module.ts');
  console.info('  npx gennady testcov src/module.ts -c 5');
  console.info('  npx gennady testcov src/module.ts -c 0');
}
