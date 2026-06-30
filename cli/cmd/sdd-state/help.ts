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
  console.info('  npx gennady sdd-state [project-root] [--probe]   (root defaults to current directory)');
  console.info('');
  console.info('Reports:');
  console.info('  FLOW_VERSION — v1 (tasks/ layout) or v2');
  console.info('  PORTAL       — whether specs/README.md exists (absent → project-setup route)');
  console.info('  [READINESS]  — package.json, exact required scripts, lint→gennady, gennady-installed');
  console.info('  [SCOPES]     — name · type · status (done/wip) · description · spec path, from the portal');
  console.info('  [PROBE]      — only with --probe: code/infra heuristics (CODE/INFRA present, dirs, configs)');
  console.info('  [SUMMARY]    — flow · portal · readiness · scope count · session (+ code/infra when probed)');
  console.info('');
  console.info('Flags:');
  console.info('  --probe   opt-in code/infra heuristics (for the root flow to branch greenfield vs from-code);');
  console.info('            omitted by default to keep flow start at minimal environment knowledge');
  console.info('');
  console.info('Exit codes:');
  console.info('  0 snapshot emitted   2 bad project root   4 bad invocation');
}
