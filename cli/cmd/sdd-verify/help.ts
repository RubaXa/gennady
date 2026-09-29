// @file: sdd-verify command help output.
// @spec: CLI-SDD-VERIFY
// @consumers: help command

/** @purpose Print the task/phase-only SDD facade contract. */
export function printHelp(): void {
  console.info('gennady sdd-verify — Verify one SDD phase through the unified Verify engine');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-verify --task <ticket-path> --phase <PhaseID>');
  console.info(
    '  npx gennady sdd-verify --task <ticket-path> --phase <PhaseID> --legacy-overlay=<provenance>'
  );
  console.info('');
  console.info('Phase mode:');
  console.info(
    '  The SDD facade validates task/phase/log identity, freezes exact scope and RuleSnapshot, resolves'
  );
  console.info(
    '  the composed selector, and calls the same planner, WorkspaceGuard, runner and VerifyRunReport'
  );
  console.info('  used by standalone `gennady verify`. It is not a second verification ladder.');
  console.info(
    '  One append-only EXECUTION_LOG attempt is opened before planning/readiness/spawn and terminalized'
  );
  console.info(
    '  as PASS/FAIL/BLOCKED/ENV_FAIL/TIMEOUT/VIOLATION/CANCELLED; proven orphan recovery alone writes'
  );
  console.info('  INTERRUPTED. Failed attempts remain after a later pass.');
  console.info(
    '  Exact Target Files plus Deleted Files choose affected providers; the resolved selector chooses'
  );
  console.info('  each provider DAG slice. The agent never chooses individual gates.');
  console.info(
    '  Declared repair steps may change only their bounded project-code write set. Ticket/control state'
  );
  console.info('  is owned only by this facade and its atomic SDD sinks.');
  console.info('');
  console.info('Explicit legacy overlay (deprecated; final cleanup owner UV-24):');
  console.info(
    '  --legacy-overlay requires a non-empty provenance string and is accepted only with task+phase.'
  );
  console.info(
    '  It enables frozen legacy receipt bytes only when every configured legacy command maps exactly'
  );
  console.info(
    '  once to a real passing direct-argv target step. Mapping is proven before spawn; no-overlay runs'
  );
  console.info('  never inherit legacy command/order semantics.');
  console.info(
    '  The independent compatibility runner and --profile/--only/--skip were removed in UV-14.'
  );
  console.info('  Whole-project verification is `npx gennady verify --phase full`.');
  console.info('');
  console.info(
    'Exit codes: 0 verified PASS · 1 terminal verification/preflight failure · 4 invalid invocation'
  );
}
