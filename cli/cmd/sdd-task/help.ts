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
  console.info(
    'A missing or malformed three-column Verification table fails before any task, phase, or group context is emitted.'
  );
  console.info(
    'GATE_QUEUE grants bootstrap setup only when each missing readiness gate has one declared ticket/phase owner.'
  );
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
  console.info(
    '  - before dispatch, the full dependency closure must exist and be [x]; cycles fail closed'
  );
  console.info(
    '  - receipt-aware tickets require current CLI evidence throughout that closure; legacy receipts are validated whenever present'
  );
  console.info(
    '  - every Target, Deleted, and prior Handoff artifact path is structurally validated before any READ/next worker context is emitted'
  );
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
    "  Group the ticket's siblings (same exact owning scope/module .spec.md) and report"
  );
  console.info(
    '  whether the group is due for audit: every ticket DONE, or which ones are still open.'
  );
  console.info('');
  console.info('  npx gennady sdd-task --group-scope <ticket-path|Task-ID>');
  console.info('  npx gennady sdd-task --task-scope <ticket-path|Task-ID>');
  console.info(
    "  Emit the group's bounded review scope for an audit/code-review subagent: union of every"
  );
  console.info(
    '  ticket phase Target Files, attributable git changes vs HEAD, and Handoff artifacts —'
  );
  console.info(
    '  exact targets/spec/tickets always belong; undeclared neighbours belong only under a group-private target directory.'
  );
  console.info(
    '  In phase and group modes, paths are exact and repo-relative: no glob, ../, absolute path, missing Target/Handoff, or any symlink component;'
  );
  console.info(
    '  a missing file is accepted only as a tracked HEAD tombstone declared under Deleted Files.'
  );
  console.info(
    '  Unborn HEAD falls back to declared files; corrupt/unavailable git or unreadable ticket corpus fails closed.'
  );
  console.info(
    '  no manual git archaeology needed. Also emits one structured `coverage-gates:` line'
  );
  console.info(
    '  per ticket: required + owner Phase-ID + verbatim §Verification reader, explicit not-applicable + reason,'
  );
  console.info(
    '  legacy-unset (grandfathered, no inference), or INVALID. No path/extension/platform'
  );
  console.info(
    '  reconstruction and no default threshold; audit executes required commands verbatim.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 surface emitted   1 unreadable/invalid ticket   2 not a ticket / unknown --phase   4 bad invocation'
  );
}
