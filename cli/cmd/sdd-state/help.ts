// @file: sdd-state command help output.
// @consumers: help command
// @tasks: N/A

/**
 * @purpose Print CLI help for the sdd-state command.
 */
export function printHelp(): void {
  console.info('gennady sdd-state — Deterministic snapshot of SDD project state (for the router)');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady sdd-state [project-root]   (root defaults to current directory)');
  console.info('');
  console.info('Reports:');
  console.info('  FLOW_VERSION — v1 (tasks/ layout) or v2');
  console.info('  PORTAL       — whether specs/README.md exists (absent → project-setup route)');
  console.info(
    '  [READINESS]  — per-target AUTHORING_SCOPE readiness, optional all-approved AUTHORING_READY aggregate, EXECUTION_READY, and exact GATE_QUEUE owners'
  );
  console.info(
    '  [SCOPES]     — name · type · status (done/wip) · description · spec path, from the portal'
  );
  console.info(
    '  [SPEC_SCHEMA] — current / invalid V2 structure, affected paths, and exact owning-authoring route (only V1→V2 is migration)'
  );
  console.info('  NEXT         — next structural authoring or execution route');
  console.info(
    '  [PROBE]      — code/infra heuristics (CODE/INFRA present, dirs, configs), always included'
  );
  console.info(
    '  [SUMMARY]    — flow · portal · authoring/execution readiness · scope count · code/infra'
  );
  console.info('');
  console.info('Flags:');
  console.info('  --probe   accepted as a no-op (probe is always on) — kept for older directives');
  console.info('');
  console.info('Exit codes:');
  console.info('  0 snapshot emitted   2 bad project root   4 bad invocation');
}
