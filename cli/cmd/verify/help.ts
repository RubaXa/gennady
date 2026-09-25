// @file: Help for the unified target verify command.
// @spec: CLI-VERIFY
// @consumers: help command

/** @purpose Print public target verify usage and terminal semantics. */
export function printHelp(): void {
  console.info('gennady verify — plan and run one phase through the unified Verify engine');
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady verify --phase=<phase> [--json]');
  console.info('  npx gennady verify --phase=<phase> --task=<ticket> --sdd-phase=<P> [--json]');
  console.info('  npx gennady verify --plan --json [--phase=<phase>]');
  console.info('');
  console.info('  Text is the default execution report; --json emits the stable machine report.');
  console.info(
    '  --plan never spawns a step or mutates the workspace; without --phase it selects full.'
  );
  console.info(
    '  Normal runs may apply only preset-declared bounded repair steps; there is no fix command.'
  );
  console.info(
    '  Standalone scope is the complete repository; SDD scope is the ticket phase Target/Deleted Files.'
  );
  console.info('');
  console.info(
    'Exit codes: 0 pass/plan · 1 terminal non-pass · 4 invocation/planning/config error'
  );
  console.info('            130 SIGINT · 143 SIGTERM (after cooperative restore)');
}
