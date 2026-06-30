// @file: sdd-task command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-task command.
 */
export function printHelp(): void {
  console.info('gennady sdd-task — Emit a ticket planning surface for the execute orchestrator');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-task <ticket-path>');
  console.info('');
  console.info('Emits (the ONLY ticket read the orchestrator needs):');
  console.info('  - Meta: Task-ID, Status, Purpose, Scope/Module, Dependencies, Spec References');
  console.info('  - Phases Overview: id · kind · deps · status');
  console.info(
    '  - Per-phase read-manifest: rules · specs · ticket sections · target files · gates + DO-NOT-READ'
  );
  console.info('  - Gates: every Verification command with its Required-by');
  console.info('');
  console.info(
    'It never emits phase bodies, BDD, specs, or code — the phase workers read those, bounded by the manifest.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 surface emitted   1 file not found   2 not a ticket (no Meta)   4 bad invocation'
  );
}
