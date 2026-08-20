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
  console.info('  npx gennady sdd-task <ticket-path> [--phase <P<N>>]');
  console.info('');
  console.info('Without --phase, emits (the ONLY ticket read the orchestrator needs):');
  console.info('  - Meta: Task-ID, Status, Purpose, Scope/Module, Dependencies, Spec References');
  console.info('  - Phases Overview: id · kind · deps · status');
  console.info(
    '  - Per-phase read-manifest: rules · specs · ticket sections · target files · gates + DO-NOT-READ'
  );
  console.info('  - Gates: every Verification command with its Required-by');
  console.info('');
  console.info('With --phase <P<N>>, emits a compact single-phase context instead:');
  console.info('  - objective · gates (each with a one-line satisfy-hint) · exit criterion');
  console.info(
    '  - read-manifest filtered to this phase (Spec Refs when declared, else the full set)'
  );
  console.info(
    "  - [HANDOFF]: prior completed phases' verbatim Handoff lines from Execution Log (omitted for the first phase)"
  );
  console.info('');
  console.info(
    'It never emits phase bodies, BDD, specs, or code — the phase workers read those, bounded by the manifest.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 surface emitted   1 file not found   2 not a ticket / unknown --phase   4 bad invocation'
  );
}
