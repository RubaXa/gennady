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
  console.info('  npx gennady sdd-task [project-root]');
  console.info('  npx gennady sdd-task <ticket-path> [--phase <P<N>>]');
  console.info('');
  console.info(
    'Without a ticket, emits the deterministic execution map for project-root (default: .).'
  );
  console.info('Pass one listed Task-ID or ticket path to get its planning surface.');
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
  console.info('  npx gennady sdd-task --audit-group <ticket-path|Task-ID>');
  console.info(
    "  Group the ticket's siblings (same directory as its owning spec — a scope or module .spec.md) and report"
  );
  console.info(
    '  whether the group is due for audit: every ticket DONE, or which ones are still open.'
  );
  console.info('');
  console.info('  npx gennady sdd-task --group-scope <ticket-path|Task-ID>');
  console.info('  npx gennady sdd-task --task-scope <ticket-path|Task-ID>');
  console.info(
    "  Emit the group's ready-made review scope for an audit/code-review subagent: union of every"
  );
  console.info(
    '  ticket phase Target Files, git diff vs HEAD (when the repo has one), and Handoff artifacts —'
  );
  console.info(
    '  no manual git archaeology needed. Also emits a `coverage-gates:` block: one ready'
  );
  console.info(
    '  `testcov --min=<ticket threshold> <ticket production files>` per ticket (threshold'
  );
  console.info('  from the ticket §Verification --min, else 80; files are its Target Files minus');
  console.info(
    '  tests; paths shell-quoted for verbatim execution) — run each verbatim, no re-reading.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 surface emitted   1 file not found   2 not a ticket / unknown --phase   4 bad invocation'
  );
}
