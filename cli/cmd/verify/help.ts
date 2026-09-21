// @file: verify command help output.
// @spec: CLI-VERIFY
// @consumers: help command

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
    '  Prints the resolved full-profile plan as JSON: { profile, stack, stacks, gates: [{ name, stack, command, required, blocking }] }.'
  );
  console.info(
    '  `stack` is the detected primary; `stacks` is the primary-then-tail detected order (D-64).'
  );
  console.info(
    '  The primary full profile is blocking; qualified extra-stack gates form a read-only,'
  );
  console.info('  non-blocking tail. `stack.use` only reorders/narrows stacks that really detect.');
  console.info(
    '  No mutating facade exists in this release (D-13/O-2) — to actually run gates, use'
  );
  console.info('  npx gennady sdd-verify --profile full [--only=<glob>] [--skip=<glob>].');
  console.info('');
  console.info(
    'Exit codes: 0 plan printed · 1 detected primary has no preset · 4 bad invocation/config'
  );
}
