// @file: sdd-log command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-log command.
 */
export function printHelp(): void {
  console.info(
    'gennady sdd-log — Append events or atomically complete a verified phase/spec draft'
  );
  console.info('');
  console.info('Usage:');
  console.info(
    '  npx gennady sdd-log <ticket> round "<reason>"     # open a new Round (auto-numbered, dated)'
  );
  console.info(
    '  npx gennady sdd-log <ticket> line "<content>" [--phase P<N>]     # append a timestamped event line'
  );
  console.info(
    '  npx gennady sdd-log <ticket> close                # append the Round-close block'
  );
  console.info(
    '  npx gennady sdd-log <ticket> phase <P-ID> ["— re-run: <reason>"]   # phase heading (#### <P-ID>)'
  );
  console.info(
    '  npx gennady sdd-log <ticket> handoff "<payload>" [--phase P<N>]  # typed **Handoff →** line, payload verbatim'
  );
  console.info(
    '  npx gennady sdd-log <ticket> blocker "<reason>" --axiom <AX> --unblock "<action>" --phase P<N>   # BLOCKER_FORMAT block'
  );
  console.info(
    '  npx gennady sdd-log <ticket> resolved "<what removed it>" --phase P<N>   # paired close for blocker — ✅ RESOLVED marker'
  );
  console.info(
    '  npx gennady sdd-log <ticket> complete "artifacts: [...]; decisions: [...]; open: [...]; deviations: [...]" --phase P<N>'
  );
  console.info(
    '  npx gennady sdd-log <spec> authoring-complete   # verify and record scope/module draft completion once'
  );
  console.info('');
  console.info('File-backed form (required for agent-produced free text):');
  console.info('  npx gennady sdd-log <ticket> round --content-file .claude/tmp/<name>');
  console.info(
    '  npx gennady sdd-log <ticket> line --content-file .claude/tmp/<name> [--phase P<N>]'
  );
  console.info(
    '  npx gennady sdd-log <ticket> phase <P-ID> [--content-file .claude/tmp/<rerun-suffix>]'
  );
  console.info(
    '  npx gennady sdd-log <ticket> handoff --content-file .claude/tmp/<name> [--phase P<N>]'
  );
  console.info(
    '  npx gennady sdd-log <ticket> resolved --content-file .claude/tmp/<name> --phase P<N>'
  );
  console.info(
    '  npx gennady sdd-log <ticket> complete --content-file .claude/tmp/<name> --phase P<N>'
  );
  console.info(
    '  npx gennady sdd-log <ticket> blocker --payload-file .claude/tmp/<name>.json --phase P<N>'
  );
  console.info('  blocker JSON keys: {"reason":"...","axiom":"AX_...","unblock":"..."}');
  console.info('');
  console.info('Guarantees:');
  console.info(
    '  - Append modes insert before a section/block boundary and never rewrite prior event lines.'
  );
  console.info(
    '  - authoring-complete requires zero sdd-check --spec --authoring hints, then writes and echoes one canonical Decision Log receipt.'
  );
  console.info(
    "  - complete requires this phase's CLI-owned sdd-verify receipt, the current-Round skeleton,"
  );
  console.info(
    '    and a typed four-field Handoff; it checks all inputs before one write that closes DONE,'
  );
  console.info(
    '    replaces the Handoff placeholder, and checks only this phase in Phases Overview.'
  );
  console.info(
    "  - --phase P<N> (line | handoff | blocker | resolved | complete) identifies THAT phase's own"
  );
  console.info(
    '    #### <PhaseID> block instead of the end of EXECUTION_LOG. Required for blocker/resolved'
  );
  console.info(
    '    so both lifecycle events stay in one phase; phases themselves execute sequentially.'
  );
  console.info('  - Timestamped — the real time is stamped into each line / round date.');
  console.info(
    '  - No fabricated DONE — content with an unreplaced <…> placeholder is rejected (exit 2).'
  );
  console.info(
    '  - Payload files are exact regular non-symlink UTF-8 files under .claude/tmp/, bounded to 32768 bytes.'
  );
  console.info(
    '  - Payload bytes are never shell-interpreted; the exact file is deleted only after a successful write.'
  );
  console.info('');
  console.info('Exit codes:');
  console.info(
    '  0 written   1 file not found/unwritable   2 missing receipt/phase state/section   4 bad invocation'
  );
}
