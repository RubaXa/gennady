// @file: sdd-log command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-log command.
 */
export function printHelp(): void {
  console.info('gennady sdd-log — Append-only writes into a ticket EXECUTION_LOG');
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx gennady sdd-log <ticket> round "<reason>"     # open a new Round (auto-numbered, dated)'
  );
  console.info(
    '  npx gennady sdd-log <ticket> line "<content>"     # append a timestamped event line'
  );
  console.info(
    '  npx gennady sdd-log <ticket> close                # append the Round-close block'
  );
  console.info(
    '  npx gennady sdd-log <ticket> phase <P-ID> ["— re-run: <reason>"]   # phase heading (#### <P-ID>)'
  );
  console.info(
    '  npx gennady sdd-log <ticket> handoff "<payload>"  # typed **Handoff →** line, payload verbatim'
  );
  console.info(
    '  npx gennady sdd-log <ticket> blocker "<reason>" --axiom <AX> --unblock "<action>"   # BLOCKER_FORMAT block'
  );
  console.info('');
  console.info('Guarantees:');
  console.info(
    '  - Append-only — content is inserted before the section close marker; prior lines are never touched.'
  );
  console.info('  - Timestamped — the real time is stamped into each line / round date.');
  console.info(
    '  - No fabricated DONE — content with an unreplaced <…> placeholder is rejected (exit 2).'
  );
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 appended   1 file not found/unwritable   2 no EXECUTION_LOG / placeholder   4 bad invocation'
  );
}
