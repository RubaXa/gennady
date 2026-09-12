// @file: verify command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the verify command.
 */
export function printHelp(): void {
  console.info('gennady verify — read-only planner/CI-reporter (D-13); never runs a gate');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady verify --plan --json');
  console.info('');
  console.info(
    '  Prints the resolved full-profile plan as JSON: { profile, stack, gates: [{ name, command, required }] }.'
  );
  console.info(
    '  `stack` is always `node`: the full profile is a fixed node ladder today and does not read'
  );
  console.info(
    '  `stack:`/`extraGates` (they reach only the phase path, V-08/V-08b) — `--plan` reports what'
  );
  console.info('  will actually run, not the declared stack.');
  console.info(
    '  No mutating facade exists in this release (D-13/O-2) — to actually run gates, use'
  );
  console.info('  npx gennady sdd-verify --profile full [--only=<glob>] [--skip=<glob>].');
  console.info('');
  console.info('Exit codes: 0 plan printed · 4 bad invocation (only --plan --json is public)');
}
