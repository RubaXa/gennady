// @file: verify command help output
// @consumers: verify.cmd.ts, gennady.ts
// @tasks: TSK-96

/**
 * @purpose Print CLI help for the verify command.
 */
export function printHelp(): void {
  console.info('gennady verify — stack-agnostic verification gates (one command for every stack)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady verify [path...] [options]');
  console.info('');
  console.info('Stacks (auto-detected by root marker file; both can be active in one repo):');
  console.info(
    '  node     package.json — gates from classified npm scripts (typecheck/lint/test/format)'
  );
  console.info(
    '  golang   go.mod — build, vet, gofmt -l, golangci-lint, go test; changed-package scoping'
  );
  console.info('');
  console.info('Scope (default: changes vs the base branch):');
  console.info('  <path...>             Files or directories (golang narrows to their packages)');
  console.info('  --all                 Whole repository — slow on monorepos');
  console.info('  --changed             Changed vs origin/master|main (default)');
  console.info('');
  console.info('Options:');
  console.info(
    '  --plan, --dry-run     Print detection, diagnostics, config provenance and the plan; run nothing'
  );
  console.info('  --json                Machine-readable detection + plan + results');
  console.info(
    '  --only=<a,b>          Run only these gates: `stack:gate` or bare `gate` (all stacks)'
  );
  console.info('  --skip=<a,b>          Drop these gates from the plan (same notation)');
  console.info('  --stack=<id>          One-shot stack.use (node | golang)');
  console.info('  --root=<path>         Repository root (default: cwd)');
  console.info('  --help, -h            Show this help');
  console.info('');
  console.info('Timeouts: every gate carries a mandatory per-gate timeout (plugin defaults;');
  console.info('  override per gate in config). There is no global timeout — the run upper');
  console.info('  bound is the sum of the plan; timeouts are shown in --plan.');
  console.info('');
  console.info('Repo config — gennady.yaml (committable) deep-merged with personal .gennadyrc');
  console.info('(repo, then $HOME); per-key winner shown in --plan. Section "stack":');
  console.info('  stack:');
  console.info('    use: [golang]');
  console.info('    golang:');
  console.info('      skipGates: [lint]');
  console.info('      overrideGates:');
  console.info('        test: { argv: [make, test], timeout: 15m }');
  console.info('        build: { env: { GOPROXY: "http://proxy.corp:3000/" } }');
  console.info('      extraGates:');
  console.info('        - { id: tidy-drift, argv: [go, mod, tidy, -diff], timeout: 5m }');
  console.info('  Invalid config (unknown key, wrong type, bad duration) stops verify: exit 4.');
  console.info('');
  console.info('Contract:');
  console.info('  RUN-ALL             every gate runs; failures accumulate in one report');
  console.info('  SUPPRESS-ON-SUCCESS passing gates print nothing');
  console.info(
    '  gates never mutate  gofmt -l / prettier --check; mutating ops belong to `gennady fix` (planned)'
  );
  console.info('  FAIL vs ENV_FAIL    a broken tool (panic, blocked proxy) is not a code finding');
  console.info('  exit 0 all pass · 1 gate failed · 4 bad invocation/config · 5 no stack detected');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady verify --plan');
  console.info('  npx gennady verify internal/userapi');
  console.info('  npx gennady verify --only=golang:build,golang:vet');
  console.info('  npx gennady verify --all --skip=test --json');
}
