// @file: verify command help output
// @consumers: verify.cmd.ts, gennady.ts
// @tasks: SPIKE-yaml-verify

/**
 * @purpose Print CLI help for the verify command.
 */
export function printHelp(): void {
  console.info('gennady verify — run the verification gates the repo declares in gennady.yaml');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady verify [options]');
  console.info('');
  console.info('No language detection, no plugins: the repo states its commands, gennady runs');
  console.info('them without a shell, applies per-gate timeouts, accumulates failures (RUN-ALL)');
  console.info('and reports with head+tail-truncated output.');
  console.info('');
  console.info('Config — gennady.yaml:');
  console.info('  verify:');
  console.info('    gates:');
  console.info('      - { id: lint,  argv: [npm, run, lint],  timeout: 5m }');
  console.info('      - { id: test,  argv: [npm, test],       timeout: 10m }');
  console.info('      - { id: fmt,   argv: [gofmt, -l, .],    outputMeansFailure: true }');
  console.info(
    '  Gate keys: id, argv (no shell), cwd, env, timeout (90s|5m|1h), outputMeansFailure.'
  );
  console.info('  Invalid config (unknown key, wrong type, bad duration) stops verify: exit 4.');
  console.info('');
  console.info('Options:');
  console.info('  --plan, --dry-run     Print the plan, run nothing');
  console.info('  --json                Machine-readable plan + results');
  console.info('  --only=<a,b>          Run only these gates');
  console.info('  --skip=<a,b>          Drop these gates from the plan (visible as skips)');
  console.info('  --root=<path>         Repository root (default: cwd)');
  console.info('  --help, -h            Show this help');
  console.info('');
  console.info('Exit codes:');
  console.info('  0 all gates passed · 1 a gate failed · 4 bad invocation or invalid config');
  console.info('  5 nothing verified (no config, or the plan executed zero gates)');
}
