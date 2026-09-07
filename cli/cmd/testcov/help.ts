// @file: testcov command help output
// @consumers: testcov.cmd.ts
// @tasks: TSK-66
/**
 * @purpose Print CLI help for the testcov command.
 */
export function printHelp(): void {
  console.info(
    'gennady testcov — Adapter-backed coverage tree and gate for supported project platforms'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady testcov [path] [options]');
  console.info('  npx gennady testcov --min=<pct> [path...]');
  console.info('');
  console.info('Options:');
  console.info('  --files               Show source files in tree (default: dirs only)');
  console.info(
    '  --run                 Clear old report → run detected local producer → require its new report'
  );
  console.info('  --check               Diagnose configuration; exit 0 if OK, 1 on errors');
  console.info('  --min=<pct>           Coverage gate; finite 0..100, decimals allowed (exit 0/1)');
  console.info('  --json                Machine-readable output (for --check or --flat)');
  console.info('  --flat                Flat list instead of tree');
  console.info('  --context, -c <N>     Nonnegative integer context lines (default: 2)');
  console.info('  --color               Enable ANSI color highlighting (red/yellow backgrounds)');
  console.info('  --help, -h            Show this help');
  console.info('  Invalid/unknown arguments exit 4 and print canonical usage.');
  console.info(
    '  A failed producer remains failed even when it emits diagnostic coverage; its exit code is retained.'
  );
  console.info(
    '  Platform selection is fail-closed: no matching adapter or several matches produce a capability diagnostic.'
  );
  console.info(
    '  The selected adapter owns producer argv and repo-relative artifacts; report paths with any symlink component fail before delete/read/run.'
  );
  console.info(
    '  --min targets are exact repo-relative regular files/directories below cwd; absolute, outside, missing, special, or symlink paths fail before adapter/report lookup.'
  );
  console.info(
    '  Unreadable source subtrees fail closed in scoped and project-wide modes; no partial threshold/tree is rendered.'
  );
  console.info(
    '  --min gates the complete adapter-owned production source-set (root-level + nested); every file needs one fresh, unambiguous report identity.'
  );
  console.info('');
  console.info(
    'File detail: when a source file is targeted, shows line-by-line annotated coverage'
  );
  console.info(
    '  Detail and per-file test counts are adapter capabilities; unsupported adapters report a typed diagnostic instead of guessing a report schema.'
  );
  console.info('  npx gennady testcov src/module.ts           full annotated view');
  console.info('  npx gennady testcov src/module.ts -c 3      ±3 context lines around uncovered');
  console.info('');
  console.info('Installed coverage adapters:');
  console.info('  istanbul-js — TypeScript/JavaScript/Vue/Svelte, coverage/coverage-final.json');
  console.info('  iOS, Android, and Go adapters are not installed/supported yet.');
  console.info('');
  console.info('Supported Istanbul producers (auto-detected from package.json):');
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
  console.info('  npx gennady testcov --run --min=80');
  console.info('  npx gennady testcov --check');
  console.info('  npx gennady testcov --check --json');
  console.info('  npx gennady testcov --flat --json');
  console.info('  npx gennady testcov src/core');
  console.info('  npx gennady testcov src/core --files');
  console.info('  npx gennady testcov src/module.ts');
  console.info('  npx gennady testcov src/module.ts -c 5');
  console.info('  npx gennady testcov src/module.ts -c 0');
}
