// @file: verify command help output
// @consumers: verify.cmd.ts, gennady.ts
// @tasks: TSK-96

import { BUILTIN_STACK_PLUGINS } from '../../../services/stack/stack-registry.ts';

/**
 * @purpose Print CLI help for the verify command.
 */
export function printHelp(): void {
  console.info('gennady verify — stack-agnostic verification gates (one command for every stack)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady verify [path...] [options]');
  console.info('');
  console.info('Stacks (auto-detected by root marker file; all detected stacks run together):');
  for (const plugin of BUILTIN_STACK_PLUGINS) {
    console.info(`  ${plugin.id.padEnd(8)} ${plugin.marker} — ${plugin.description}`);
  }
  console.info('');
  console.info('Scope (default: changes vs the base branch):');
  console.info('  <path...>             Files or directories (golang narrows to their packages)');
  console.info('  --all                 Whole repository — slow on monorepos');
  console.info(
    '  --changed             Changed vs origin/HEAD, falling back to main|master (default)'
  );
  console.info('');
  console.info('Options:');
  console.info(
    '  --plan, --dry-run     Print detection, diagnostics, config provenance and the plan; run nothing'
  );
  console.info('  --json                Machine-readable detection + plan + results');
  console.info('  --wip                 Verify uncommitted work: no clean-tree precondition, no');
  console.info('                        drift detection, never resets. Waits for a held lock.');
  console.info('  --full-output         Do not truncate gate output in --json results');
  console.info(
    '  --only=<a,b>          Run only these gates: `stack:gate` or bare `gate` (all stacks)'
  );
  console.info('  --skip=<a,b>          Drop these gates from the plan (same notation)');
  console.info('  --stack=<id>          One-shot stack.use (anystack | golang | node)');
  console.info('  --root=<path>         Repository root (default: cwd)');
  console.info('  --help, -h            Show this help');
  console.info('');
  console.info('Timeouts: every gate runs under a per-gate timeout — a plugin default, 10m for');
  console.info('  a config gate that omits one, or the `timeout` you set. No global timeout — the');
  console.info('  run upper bound is the sum of the plan; timeouts are shown in --plan.');
  console.info('');
  console.info('Repo config — gennady.yaml (committable) deep-merged with personal .gennadyrc');
  console.info('(repo, then $HOME); per-key winner shown in --plan. Section "stack":');
  console.info('  stack:');
  console.info('    use: [golang]');
  console.info('    golang:');
  console.info('      skipGates: [lint]');
  console.info('      overrideGates:');
  console.info('        test: { argv: [make, test], timeout: 15m }');
  console.info('        build: { env: { GOPROXY: "https://goproxy.example.com/" } }');
  console.info('      extraGates:');
  console.info('        - { id: tidy-drift, argv: [go, mod, tidy, -diff], timeout: 5m }');
  console.info('  Invalid config (unknown key, wrong type, bad duration) stops verify: exit 4.');
  console.info('');
  console.info('Contract:');
  console.info('  RUN-ALL             every gate runs; failures accumulate in one report');
  console.info('  SUPPRESS-ON-SUCCESS passing gates print nothing');
  console.info(
    '  gates never mutate  gofmt -l / prettier --check; mutating ops belong to `gennady fix`'
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
